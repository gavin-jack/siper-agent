"""
Patch Tool - Precise find-and-replace file editing.
Supports replace mode (single-file) and patch mode (multi-file batch).
"""

import re
from pathlib import Path
from typing import Dict, Any, List, Tuple
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


# Path safety — import from centralized module
from .path_safety import is_safe_path as _is_safe_path


def _generate_diff(old_content: str, new_content: str, path: str) -> str:
    """Generate a simple unified diff between old and new content."""
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)

    # Ensure lines end with newline for clean diff
    if old_lines and not old_lines[-1].endswith("\n"):
        old_lines[-1] += "\n"
    if new_lines and not new_lines[-1].endswith("\n"):
        new_lines[-1] += "\n"

    diff_lines = [f"--- {path}", f"+++ {path}"]

    # Simple line-by-line diff
    max_len = max(len(old_lines), len(new_lines))
    in_hunk = False
    hunk_old_start = 0
    hunk_new_start = 0
    old_count = 0
    new_count = 0

    # Build a simple diff: mark removed lines with -, added with +
    i, j = 0, 0
    while i < len(old_lines) or j < len(new_lines):
        if i < len(old_lines) and j < len(new_lines) and old_lines[i] == new_lines[j]:
            # Context line
            if in_hunk:
                diff_lines.append(old_lines[i].rstrip("\n"))
            i += 1
            j += 1
        else:
            if not in_hunk:
                in_hunk = True
                # Emit context before hunk
                ctx_start = max(0, i - 3)
                hunk_old_start = i + 1
                hunk_new_start = j + 1
                old_ctx = []
                new_ctx = []
                for k in range(ctx_start, i):
                    old_ctx.append(old_lines[k].rstrip("\n"))
                # We'll emit the header later; collect lines first
                diff_lines.append(f"@@ -{hunk_old_start} +{hunk_new_start} @@")
                for ctx_line in old_ctx:
                    diff_lines.append(" " + ctx_line)

            # Emit removed lines
            while i < len(old_lines):
                line = old_lines[i]
                is_match = False
                # Check if this old line appears in remaining new lines
                for jj in range(j, min(j + 5, len(new_lines))):
                    if old_lines[i] == new_lines[jj]:
                        is_match = True
                        break
                if is_match:
                    break
                diff_lines.append("-" + line.rstrip("\n"))
                i += 1

            # Emit added lines
            while j < len(new_lines):
                line = new_lines[j]
                is_match = False
                for ii in range(i, min(i + 5, len(old_lines))):
                    if new_lines[j] == old_lines[ii]:
                        is_match = True
                        break
                if is_match:
                    break
                diff_lines.append("+" + line.rstrip("\n"))
                j += 1

    if not in_hunk:
        # No changes detected
        return "(no changes)"

    return "\n".join(diff_lines)


def _apply_patch(patch_str: str) -> List[Tuple[str, str, str]]:
    """
    Parse a V4A-format patch string and apply to files.
    Returns list of (path, diff_preview, error) tuples.
    """
    results = []

    # Split by file markers
    sections = re.split(r"\n(?=\*\*\* Update File: )", patch_str)

    for section in sections:
        # Extract file path
        path_match = re.search(r"\*\*\* Update File: (.+?)(?:\s*\*\*\*|\s*$)", section)
        if not path_match:
            # Also handle inline format: *** Update File: path ***
            path_match = re.search(r"\*\*\* Update File: (.+?)\s*\*\*\*", section)
        if not path_match:
            continue

        file_path = path_match.group(1).strip()
        path = Path(file_path).expanduser().resolve()

        # Safety check
        safe, err = _is_safe_path(path)
        if not safe:
            results.append((file_path, "", f"安全拒绝: {err}"))
            continue

        if not path.exists():
            results.append((file_path, "", f"文件不存在: {file_path}"))
            continue

        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                old_content = f.read()
        except Exception as e:
            results.append((file_path, "", f"读取失败: {e}"))
            continue

        # Apply the patch by processing hunks
        new_content = _apply_hunks(old_content, section)
        if new_content is None:
            results.append((file_path, "", "补丁解析失败"))
            continue

        if new_content == old_content:
            results.append((file_path, "(无变化)", ""))
            continue

        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
        except Exception as e:
            results.append((file_path, "", f"写入失败: {e}"))
            continue

        diff = _generate_diff(old_content, new_content, file_path)
        results.append((file_path, diff, ""))

    return results


def _apply_hunks(content: str, patch_section: str) -> str:
    """
    Apply hunks from a patch section to content.
    Parses @@ hunk headers and applies +/- line changes.
    """
    lines = content.splitlines(keepends=True)
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"

    # Extract all hunks from the section
    # Find the part after the Update File line
    file_marker_end = patch_section.find("***", patch_section.find("Update File:"))
    if file_marker_end == -1:
        body = patch_section
    else:
        # Find end of the *** line
        end_of_line = patch_section.find("\n", file_marker_end)
        if end_of_line == -1:
            return content
        body = patch_section[end_of_line + 1:]

    # Parse hunks: find @@ markers
    hunk_pattern = re.compile(r"@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@")

    result_lines = list(lines)
    offset_adjust = 0

    # Split by @@ markers
    hunk_starts = list(hunk_pattern.finditer(body))

    for match in hunk_starts:
        old_start = int(match.group(1))
        hunk_body_start = match.end()

        # Find end of this hunk (next @@ or end of body)
        next_match = hunk_pattern.search(body, hunk_body_start)
        if next_match:
            hunk_body = body[hunk_body_start:next_match.start()]
        else:
            hunk_body = body[hunk_body_start:]

        # Parse hunk body lines
        hunk_lines = hunk_body.splitlines()

        # Apply hunk
        insert_pos = old_start - 1 + offset_adjust
        remove_count = 0
        additions = []

        for hl in hunk_lines:
            if not hl:
                continue
            if hl[0] == "-":
                remove_count += 1
            elif hl[0] == "+":
                additions.append(hl[1:])
            elif hl[0] == " ":
                # Context line - just advance
                remove_count += 1

        # Remove old lines and insert new ones
        if insert_pos < 0:
            insert_pos = 0
        if insert_pos + remove_count > len(result_lines):
            remove_count = len(result_lines) - insert_pos

        del result_lines[insert_pos:insert_pos + remove_count]
        for k, add_line in enumerate(additions):
            result_lines.insert(insert_pos + k, add_line + "\n")

        offset_adjust += len(additions) - remove_count

    return "".join(result_lines)


class PatchTool(BaseTool):
    """Precise file editing via find-and-replace or multi-file patch application."""

    def __init__(self):
        super().__init__(
            name="patch",
            description="对文件进行精确的查找替换编辑。支持 replace 模式（查找 old_string 替换为 new_string）和 patch 模式（多文件批量补丁）。安全性：禁止路径穿越（..），禁止操作 /etc/ 等敏感目录。",
            schema={
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "enum": ["replace", "patch"],
                        "description": "操作模式：'replace' 单文件替换，'patch' 多文件补丁"
                    },
                    "path": {
                        "type": "string",
                        "description": "目标文件路径（replace 模式必填）"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "要查找的文本（replace 模式必填）"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "替换后的文本（replace 模式必填）"
                    },
                    "replace_all": {
                        "type": "boolean",
                        "description": "是否替换所有出现（默认 false，仅替换首次出现）",
                        "default": False
                    },
                    "patch": {
                        "type": "string",
                        "description": "V4A 格式的补丁字符串（patch 模式必填）"
                    }
                },
                "required": ["mode"]
            },
            toolsets=["file", "core"],
            category=ToolCategory.FILE
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        mode = parameters.get("mode", "replace")

        if mode == "replace":
            return await self._execute_replace(parameters)
        elif mode == "patch":
            return await self._execute_patch(parameters)
        else:
            return ToolResult(
                success=False,
                error=f"未知模式: {mode}，支持 'replace' 或 'patch'"
            )

    async def _execute_replace(self, parameters: Dict[str, Any]) -> ToolResult:
        file_path = parameters.get("path", "")
        old_string = parameters.get("old_string", "")
        new_string = parameters.get("new_string", "")
        replace_all = parameters.get("replace_all", False)

        if not file_path:
            return ToolResult(
                success=False,
                error="replace 模式需要提供 path 参数"
            )
        if old_string == "":
            return ToolResult(
                success=False,
                error="replace 模式需要提供 old_string 参数（不能为空字符串）"
            )

        try:
            path = Path(file_path).expanduser().resolve()

            # Safety check
            safe, err = _is_safe_path(path)
            if not safe:
                return ToolResult(
                    success=False,
                    error=f"安全拒绝: {err}"
                )

            if not path.exists():
                return ToolResult(
                    success=False,
                    error=f"文件不存在: {file_path}"
                )
            if not path.is_file():
                return ToolResult(
                    success=False,
                    error=f"不是文件: {file_path}"
                )

            # Check file size (max 500KB)
            file_size = path.stat().st_size
            if file_size > 500_000:
                return ToolResult(
                    success=False,
                    error=f"文件过大（{file_size:,} 字节）。最大允许 500KB。"
                )

            with open(path, "r", encoding="utf-8", errors="replace") as f:
                old_content = f.read()

            # Count occurrences
            count = old_content.count(old_string)
            if count == 0:
                return ToolResult(
                    success=False,
                    error=f"未找到指定的文本: {old_string[:100]}..."
                )

            # Perform replacement
            if replace_all:
                new_content = old_content.replace(old_string, new_string)
                replacements = count
            else:
                new_content = old_content.replace(old_string, new_string, 1)
                replacements = 1

            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)

            diff = _generate_diff(old_content, new_content, str(path))

            return ToolResult(
                success=True,
                data=diff,
                metadata={
                    "path": str(path),
                    "replacements": replacements,
                    "mode": "replace"
                }
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"替换错误: {str(e)}"
            )

    async def _execute_patch(self, parameters: Dict[str, Any]) -> ToolResult:
        patch_str = parameters.get("patch", "")

        if not patch_str:
            return ToolResult(
                success=False,
                error="patch 模式需要提供 patch 参数"
            )

        try:
            results = _apply_patch(patch_str)

            if not results:
                return ToolResult(
                    success=False,
                    error="补丁解析失败：未找到有效的 *** Update File: *** 标记"
                )

            all_success = True
            combined_diff = []
            files_processed = []

            for file_path, diff, error in results:
                files_processed.append(file_path)
                if error:
                    all_success = False
                    combined_diff.append(f"[ERROR] {file_path}: {error}")
                else:
                    combined_diff.append(f"=== {file_path} ===\n{diff}")

            return ToolResult(
                success=all_success,
                data="\n\n".join(combined_diff),
                metadata={
                    "files": files_processed,
                    "mode": "patch",
                    "file_count": len(results),
                    "success_count": sum(1 for _, _, e in results if not e)
                }
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"补丁应用错误: {str(e)}"
            )
