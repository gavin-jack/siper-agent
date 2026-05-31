"""
Search Files Tool - Search file contents (grep) and find files by name.
"""

import re
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory

_NOISE_DIRS = ('__pycache__', '.git', 'node_modules', '.venv', 'venv')


class SearchFilesTool(BaseTool):
    """Search file contents with regex or find files by glob pattern."""

    def __init__(self):
        super().__init__(
            name="search_files",
            description="Search file contents (like grep) or find files by name pattern. Supports regex for content search and glob for file search. Supports Windows paths (e.g. C:\\Users\\Projects) - automatically converted to Linux paths.",
            schema={
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern for content search, or glob pattern (e.g., '*.py') for file search"
                    },
                    "target": {
                        "type": "string",
                        "description": "'content' to search inside files, 'files' to find files by name",
                        "default": "content"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory or file to search in (default: current directory)",
                        "default": "."
                    },
                    "file_glob": {
                        "type": "string",
                        "description": "Filter files by pattern in content mode (e.g., '*.py')",
                        "default": None
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "Maximum directory depth for recursive search (default: 10, set to 1 for current dir only)",
                        "default": 10
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 50)",
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
        max_depth = parameters.get("max_depth", 10)

        try:
            # Replace placeholder paths that LLM may generate
            search_path = str(search_path).replace('<项目目录>', str(Path(__file__).resolve().parent.parent.parent))
            search_path = str(search_path).replace('<project_dir>', str(Path(__file__).resolve().parent.parent.parent))
            path = Path(search_path).expanduser().resolve()
            # Fallback to project root if path doesn't exist
            if not path.exists():
                path = Path(__file__).resolve().parent.parent.parent
            if target == "files":
                return self._find_files(path, pattern, limit, max_depth)
            else:
                return self._grep_files(path, pattern, file_glob, limit, max_depth)
        except Exception as e:
            return ToolResult(success=False, error=f"Search error: {str(e)}")

    def _find_files(self, path: Path, pattern: str, limit: int, max_depth: int = 10) -> ToolResult:
        """Find files by glob pattern."""
        if path.is_file():
            path = path.parent

        matches = []
        if max_depth <= 0:
            max_depth = 10
        for item in path.rglob(pattern):
            if not item.is_file():
                continue
            rel_parts = item.relative_to(path).parts
            if any(p in _NOISE_DIRS for p in rel_parts):
                continue
            if len(rel_parts) > max_depth:
                continue
            matches.append(str(item.relative_to(path)))
            if len(matches) >= limit:
                break

        return ToolResult(
            success=True,
            data="\n".join(matches) if matches else "No files found",
            metadata={"pattern": pattern, "match_count": len(matches), "target": "files"}
        )

    def _grep_files(self, path: Path, pattern: str, file_glob: str, limit: int, max_depth: int = 10) -> ToolResult:
        """Search file contents with regex."""
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error as e:
            return ToolResult(success=False, error=f"Invalid regex: {e}")

        matches = []
        files_searched = 0

        if path.is_file():
            files = [path]
        else:
            glob_pattern = file_glob or "*"
            files = list(path.rglob(glob_pattern))

        for filepath in files:
            if not filepath.is_file():
                continue
            rel_parts = filepath.relative_to(path).parts
            if any(p in _NOISE_DIRS for p in rel_parts):
                continue
            if len(rel_parts) > max_depth:
                continue
            try:
                if filepath.stat().st_size > 200_000:
                    continue
                # Skip binary files
                with open(filepath, "rb") as bf:
                    chunk = bf.read(8192)
                    if b'\x00' in chunk:
                        continue
                with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                    for line_num, line in enumerate(f, 1):
                        if regex.search(line):
                            rel_path = filepath.relative_to(path) if not path.is_file() else filepath.name
                            matches.append(f"{rel_path}:{line_num}: {line.rstrip()}")
                            if len(matches) >= limit:
                                break
                files_searched += 1
            except (PermissionError, OSError):
                continue
            if len(matches) >= limit:
                break

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
