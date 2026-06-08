# 静态文件路径遍历防护

## 问题

siper_web.py 的 HTTP 服务器使用手写的路由处理静态文件请求。原始代码：

```python
if path.startswith("/static/"):
    file_path = os.path.join(os.path.dirname(__file__), "web", path.lstrip("/"))
    if os.path.isfile(file_path):
        # ... serve file
```

攻击者可通过 `/static/../../../etc/passwd` 等路径遍历读取任意文件。

## 修复模式

使用 `Path.resolve()` + `startswith` 验证解析后的路径不逃逸出预期目录：

```python
if path.startswith("/static/"):
    requested = Path(os.path.join(os.path.dirname(__file__), "web", path.lstrip("/")))
    static_root = Path(os.path.join(os.path.dirname(__file__), "web", "static")).resolve()
    try:
        resolved = requested.resolve()
    except Exception:
        resolved = None
    if resolved and str(resolved).startswith(str(static_root)) and resolved.is_file():
        # ... serve file using `resolved` (not `file_path`)
```

## 关键点

1. **先 resolve 再检查**：`Path.resolve()` 会展开 `..` 和符号链接，得到真实绝对路径
2. **startswith 验证**：确保解析后的路径以预期目录开头
3. **变量名一致性**：patch 时如果将 `file_path` 改为 `resolved`，同一 block 内所有引用也必须更新
4. **异常处理**：`resolve()` 可能抛出异常（如路径不存在），需要 try/except

## 验证方法

```bash
# 路径遍历应返回 404
curl -s -o /dev/null -w "%{http_code}" "http://localhost:7240/static/../../../etc/passwd"

# 正常静态文件应返回 200
curl -s -o /dev/null -w "%{http_code}" "http://localhost:7240/static/pages/core.js"
```

## 适用范围

此模式适用于所有手写的静态文件服务代码，包括：
- `/static/` 路径的静态文件服务
- `/api/avatar` 头像服务（当前为硬编码路径，无遍历风险）
- `api_list_files` 文件浏览器（已有 `Path.resolve()` 防护）
