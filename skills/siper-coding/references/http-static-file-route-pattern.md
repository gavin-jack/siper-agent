# siper_web.py 静态文件路由模式（v0.9.52）

## 问题

`siper_web.py` 的 `handle_request()` 函数在第 691 行统一对所有 `resp` 值执行 `json.dumps()` 序列化。如果静态文件路由返回一个 `Response` 对象或 dict，会被 JSON 序列化后发送，导致浏览器收到的是 JSON 而不是文件内容。

## 模式

添加静态文件路由（如 `/uploads/`）时，必须绕过 JSON 序列化：

```python
if path.startswith("/uploads/"):
    upload_root = (PROJECT_ROOT / "uploads").resolve()
    requested = (PROJECT_ROOT / path.lstrip("/")).resolve()
    resolved = requested.resolve()

    # 路径穿越防护
    if not str(resolved).startswith(str(upload_root)):
        writer.write(b"HTTP/1.1 403 Forbidden\r\n\r\n")
        await writer.drain()
        writer.close()
        return

    if resolved.is_file():
        # 根据扩展名设置 Content-Type
        mime_types = {".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml"}
        content_type = mime_types.get(resolved.suffix.lower(), "application/octet-stream")

        data = resolved.read_bytes()
        headers = (
            f"HTTP/1.1 200 OK\r\n"
            f"Content-Type: {content_type}\r\n"
            f"Content-Length: {len(data)}\r\n"
            f"Access-Control-Allow-Origin: *\r\n"
            f"Cache-Control: public, max-age=86400\r\n"
            f"Connection: close\r\n"
            f"\r\n"
        )
        writer.write(headers.encode() + data)
        await writer.drain()
        writer.close()
        return  # ← 关键：return 跳过 json.dumps
    else:
        writer.write(b"HTTP/1.1 404 Not Found\r\n\r\n")
        await writer.drain()
        writer.close()
        return
```

## ⚠️ `\r\n` 转义陷阱

在 Python 字符串字面量中，`"\r\n"` 会被解释为实际的 CR+LF 字符。当通过 `write_file` 写入包含 HTTP 头的 Python 代码时，必须使用 `"\\r\\n"`（双反斜杠）来表示字面量 `\r\n`：

```python
# ❌ 错误：\r\n 变成实际回车换行，字符串断裂
headers = "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\n\r\n"

# ✅ 正确：\\r\\n 在运行时产生字面量 \r\n
headers = "HTTP/1.1 200 OK\\r\\nContent-Type: image/png\\r\\n\\r\\n"
```

## 验证

```bash
# 上传测试文件
echo "test" > /home/gavin/.siper/uploads/test.txt

# 验证路由
curl -sI http://127.0.0.1:9724/uploads/test.txt
# 期望：HTTP/1.1 200 OK + Content-Type: application/octet-stream

# 验证路径穿越防护
curl -sI http://127.0.0.1:9724/uploads/../../../etc/passwd
# 期望：HTTP/1.1 403 Forbidden
```

## 相关陷阱

- **忘记 `return`**：如果不 return，代码会继续执行到 `json.dumps(resp)`，导致响应变成 JSON
- **忘记 `writer.close()`**：连接保持打开，客户端一直等待
- **忘记 CORS 头**：前端 fetch/XHR 可能被 CORS 策略阻止
