"""
Search Files Tool - Search file contents (grep) and find files by name.

When to use:
- Use target='content' when looking for specific code, text, or patterns inside files
- Use target='files' when looking for files by name pattern (e.g., '*.py', 'README*')
- Supports regex for content search and glob for file search
- Supports Windows paths (e.g. C:\\Users\\Projects) - automatically converted to Linux paths

Performance notes:
- Content search uses thread pool for parallel file scanning
- Binary files and noise directories (.git, node_modules, __pycache__) are auto-skipped
- Files larger than 200KB are skipped by default
- Results are sorted by relevance (match count) then by path
"""
import re
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory

_NOISE_DIRS = frozenset(('__pycache__', '.git', 'node_modules', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', 'dist', 'build', '.eggs'))
_MAX_FILE_SIZE = 200_000  # 200KB
_MAX_WORKERS = 4


def _load_gitignore(path: Path) -> List[re.Pattern]:
    """Load .gitignore patterns from directory and its parents."""
    patterns = []
    current = path if path.is_dir() else path.parent
    for _ in range(10):  # max 10 levels up
        gitignore = current / '.gitignore'
        if gitignore.is_file():
            try:
                with open(gitignore, 'r', encoding='utf-8', errors='replace') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            # Convert glob to regex
                            pat = line.replace('.', r'\.').replace('*', '.*').replace('?', '.')
                            if not pat.startswith('.*'):
                                pat = '^' + pat
                            try:
                                patterns.append(re.compile(pat))
                            except re.error:
                                pass
            except (PermissionError, OSError):
                pass
        if current.parent == current:
            break
        current = current.parent
    return patterns


def _is_ignored(rel_path: str, gitignore_patterns: List[re.Pattern]) -> bool:
    """Check if a relative path matches any gitignore pattern."""
    for pat in gitignore_patterns:
        if pat.search(rel_path):
            return True
    return False


def _search_single_file(args: Tuple[Path, Path, re.Pattern]) -> List[str]:
    """Search a single file for regex matches. Returns list of 'path:line: text'."""
    filepath, base_path, regex = args
    results = []
    try:
        stat = filepath.stat()
        if stat.st_size > _MAX_FILE_SIZE:
            return results
        # Quick binary check
        with open(filepath, 'rb') as bf:
            chunk = bf.read(8192)
            if b'\x00' in chunk:
                return results
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            for line_num, line in enumerate(f, 1):
                if regex.search(line):
                    rel_path = filepath.relative_to(base_path) if not base_path.is_file() else filepath.name
                    results.append(f"{rel_path}:{line_num}: {line.rstrip()}")
    except (PermissionError, OSError):
        pass
    return results


class SearchFilesTool(BaseTool):
    """Search file contents with regex or find files by glob pattern.

    Performance: Uses thread pool for parallel content scanning.
    Auto-skips binary files, noise dirs, and .gitignore'd paths.
    """

    def __init__(self):
        super().__init__(
            name="search_files",
            description=(
                "Search file contents (like grep) or find files by name.\n\n"
                "When to use:\n"
                "- target='content': looking for code/text patterns inside files (supports regex)\n"
                "- target='files': finding files by name pattern (supports glob like '*.py')\n\n"
                "Parameters:\n"
                "- pattern: regex for content search, or glob for file search (required)\n"
                "- target: 'content' (default) or 'files'\n"
                "- path: directory to search (default: current directory)\n"
                "- file_glob: filter files in content mode (e.g., '*.py')\n"
                "- max_depth: max directory depth (default: 5, set 1 for current dir only)\n"
                "- limit: max results (default: 50, max: 200)\n\n"
                "Returns: matching lines with file:line format, or file paths for target='files'\n\n"
                "Note: binary files, .git, node_modules, __pycache__ are auto-skipped. "
                "Files >200KB are skipped. .gitignore patterns are respected."
            ),
            schema={
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern for content search, or glob pattern (e.g., '*.py') for file search"
                    },
                    "target": {
                        "type": "string",
                        "description": "'content' to search inside files (default), 'files' to find files by name",
                        "default": "content"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory or file to search in (default: current directory)",
                        "default": "."
                    },
                    "file_glob": {
                        "type": "string",
                        "description": "Filter files by pattern in content mode (e.g., '*.py'). Ignored for target='files'.",
                        "default": None
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "Maximum directory depth for recursive search (default: 5, set to 1 for current dir only)",
                        "default": 5
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 50, max: 200)",
                        "default": 50
                    }
                },
                "required": ["pattern"]
            },
            toolsets=["file", "search", "core"],
            category=ToolCategory.FILE
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        pattern = parameters.get("pattern", "")
        target = parameters.get("target", "content")
        search_path = parameters.get("path", ".")
        file_glob = parameters.get("file_glob", None)
        limit = min(parameters.get("limit", 50), 200)
        max_depth = parameters.get("max_depth", 5)

        try:
            search_path = str(search_path).replace('<项目目录>', str(Path(__file__).resolve().parent.parent.parent))
            search_path = str(search_path).replace('<project_dir>', str(Path(__file__).resolve().parent.parent.parent))
            path = Path(search_path).expanduser().resolve()
            if not path.exists():
                path = Path(__file__).resolve().parent.parent.parent
            if target == "files":
                return self._find_files(path, pattern, limit, max_depth)
            else:
                return self._grep_files(path, pattern, file_glob, limit, max_depth)
        except Exception as e:
            return ToolResult(success=False, error=f"Search error: {str(e)}")

    def _find_files(self, path: Path, pattern: str, limit: int, max_depth: int = 5) -> ToolResult:
        """Find files by glob pattern with .gitignore awareness."""
        if path.is_file():
            path = path.parent

        gitignore_patterns = _load_gitignore(path)
        matches = []

        for item in path.rglob(pattern):
            if not item.is_file():
                continue
            rel_parts = item.relative_to(path).parts
            if any(p in _NOISE_DIRS for p in rel_parts):
                continue
            if len(rel_parts) > max_depth:
                continue
            rel_str = str(item.relative_to(path))
            if _is_ignored(rel_str, gitignore_patterns):
                continue
            matches.append(rel_str)
            if len(matches) >= limit:
                break

        return ToolResult(
            success=True,
            data="\n".join(matches) if matches else "No files found",
            metadata={"pattern": pattern, "match_count": len(matches), "target": "files"}
        )

    def _grep_files(self, path: Path, pattern: str, file_glob: Optional[str], limit: int, max_depth: int = 5) -> ToolResult:
        """Search file contents with regex using thread pool for parallelism."""
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error as e:
            return ToolResult(success=False, error=f"Invalid regex: {e}")

        gitignore_patterns = _load_gitignore(path)

        if path.is_file():
            files = [path]
        else:
            glob_pattern = file_glob or "*"
            files = list(path.rglob(glob_pattern))

        # Filter files before searching
        searchable_files = []
        for filepath in files:
            if not filepath.is_file():
                continue
            rel_parts = filepath.relative_to(path).parts
            if any(p in _NOISE_DIRS for p in rel_parts):
                continue
            if len(rel_parts) > max_depth:
                continue
            rel_str = str(filepath.relative_to(path))
            if _is_ignored(rel_str, gitignore_patterns):
                continue
            searchable_files.append(filepath)

        # Parallel search with thread pool
        matches: List[str] = []
        files_searched = 0

        with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
            futures = {
                executor.submit(_search_single_file, (fp, path, regex)): fp
                for fp in searchable_files
            }
            for future in as_completed(futures):
                try:
                    file_matches = future.result()
                    matches.extend(file_matches)
                    files_searched += 1
                    if len(matches) >= limit:
                        # Cancel remaining futures
                        for f in futures:
                            f.cancel()
                        break
                except Exception:
                    continue

        # Sort: by file path, then by line number
        def sort_key(m: str) -> Tuple[str, int]:
            parts = m.split(':', 2)
            if len(parts) >= 2:
                try:
                    return (parts[0], int(parts[1]))
                except ValueError:
                    pass
            return (m, 0)

        matches.sort(key=sort_key)
        if len(matches) > limit:
            matches = matches[:limit]

        return ToolResult(
            success=True,
            data="\n".join(matches) if matches else "No matches found",
            metadata={
                "pattern": pattern,
                "match_count": len(matches),
                "files_searched": files_searched,
                "target": "content"
            }
        )
