# 文件附件渲染完整链路（v0.9.52）

## 完整数据流

```
用户选择文件 → 前端 uploadFiles()
    ↓
POST /api/upload → 后端保存到 uploads/ → 返回 {path, name, category}
    ↓
用户发送消息 → WS {type:"message", content:"...", images:[{data, name, mime}]}
    ↓
后端 _process_web_message():
  - 保存图片到 uploads/（如果 images 字段存在）
  - 拼接 "[Image: /path]" 到 content 文本
  - 调用 agent.chat() 获取回复
    ↓
stream_end / response 消息:
  - data.attachments = [{url, name, category, type}]
  - data.response = LLM 最终回复文本
    ↓
前端 core.js stream_end 处理:
  - 渲染 Markdown 回复
  - 查找 .msg-row.agent .msg-body
  - append 图片缩略图（buildAttachmentsHtml）
```

## 后端关键代码

### 1. `/uploads/` 静态文件路由（siper_web.py ~line 619）
必须直接写 HTTP 响应并 return，不能返回 Response 对象（会被 json.dumps 序列化）。
详见 `references/http-static-file-route-pattern.md`。

### 2. `stream_end` 附加 attachments（siper_web.py）
```python
result = {
    "type": "stream_end",
    "data": {
        "response": final_text,
        "attachments": [{"url": "/uploads/filename.png", "name": "filename.png", "category": "image", "type": "image"}],
        # ... usage, tools, skills, time
    }
}
```

### 3. `_build_user_content` 多模态 fallback（agent.py ~line 518）
当 `vision_client` 为 None 时，将图片转为 base64 数据 URL 的 OpenAI 多模态格式：
```python
content_parts = [{"type": "text", "text": clean_message}]
for img_path in image_paths:
    data = base64.b64encode(Path(img_path).read_bytes()).decode()
    mime = "image/png"  # 根据扩展名判断
    content_parts.append({
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{data}"}
    })
return content_parts
```

## 常见陷阱

| 陷阱 | 症状 | 修复 |
|------|------|------|
| 忘记 `/uploads/` 路由 | 图片 URL 404 | 添加静态文件路由 |
| 忘记 `return` 跳过 json.dumps | 浏览器收到 JSON 而非图片 | writer 直接写 + return |
| `stream_end` 无 `attachments` | 前端不渲染图片 | 在 result dict 中附加 attachments |
| `vision_client=None` 时只传路径文本 | LLM 无法"看到"图片 | 转为 base64 多模态格式 |
| `\r\n` 转义问题 | HTTP 头断裂 | 用 `"\\r\\n"` 双反斜杠 |

## 验证步骤

1. 上传图片：`curl -F "file=@test.png" http://127.0.0.1:9724/api/upload`
2. 验证静态文件：`curl -sI http://127.0.0.1:9724/uploads/test.png`
3. 发送带图片的消息，检查 `stream_end` 是否包含 `attachments`
4. 前端检查 `.msg-body` 中是否有图片缩略图
