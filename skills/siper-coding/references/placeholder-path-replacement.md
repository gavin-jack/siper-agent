# Placeholder Path Replacement Pattern

## Problem

LLM doesn't know the actual project path. When calling `search_files` or `read_file`, it may pass placeholder paths like:
- `<项目目录>/webui/static/style.css`
- `<项目目录>`
- `<project_dir>/some/path`

`Path('<项目目录>').resolve()` resolves to a non-existent directory under CWD, causing "No matches found" or "File not found".

## Solution

In both `search_files_tool.py` and `read_file_tool.py`:

```python
# Replace placeholder paths that LLM may generate
search_path = str(search_path).replace('<项目目录>', str(Path(__file__).resolve().parent.parent.parent))
```

Additionally, if the resolved path doesn't exist, fall back to project root:

```python
path = Path(search_path).expanduser().resolve()
if not path.exists():
    path = Path(__file__).resolve().parent.parent.parent  # project root
```

## Key Pitfall

`Path('<项目目录>').resolve()` does NOT raise an error — it silently resolves to a path under CWD. Always validate path existence before searching.

## Affected Tools

- `search_files_tool.py` — path parameter
- `read_file_tool.py` — file_path parameter

Both must apply placeholder replacement before any path operations.

## Verification

```python
# Test: LLM passes placeholder path
tool = SearchFilesTool()
result = await tool.execute(pattern="chat-model-select", path="<项目目录>/webui")
# Should find style.css:946, NOT return "No matches found"
```
