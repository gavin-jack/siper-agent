# 文件附件与缩略图渲染架构（v0.8.0+）

## 概述

文件上传、预览缩略图和消息气泡中的附件渲染分散在 3 个文件中。缺少任何一个环节都会导致附件不可见。

## 文件职责

| 文件 | 职责 |
|------|------|
| `page-chat.js` | 文件选择/拖拽/粘贴 → `pendingFiles[]` → `renderFilePreviews()` → `uploadFiles()` → `addMsgHtml()` + WS `images` 字段 |
| `core.js` | WS `stream_end`/`response` 处理 → 将 `attachments` 加入 meta → `addMsg()` 渲染 |
| `style.css` | `.file-preview-*`（输入区预览）、`.chat-image`、`.chat-file-ref`、`.msg-attachments`（气泡内） |
| `agent.py` | `_build_user_content()` 解析 `[Image: ...]` 和 `[File: ...]` 标记，处理多模态/文本附件 |

## 数据流

```
用户选择文件/拖拽/粘贴
  → FileReader.readAsDataURL() → pendingFiles.push({data, mime, name, category})
  → renderFilePreviews() → 输入区显示缩略图（.file-preview-thumb）

点击发送
  → uploadFiles() → POST /api/upload → 返回 [{path, name, category}]
  → addMsgHtml(html, 'user') → 气泡内 <img class="chat-image"> 或 <div class="chat-file-ref">
  → WS 消息:
      - 图片: { type:'message', content: text, images: [{data, name, mime}], session_id }
      - 非图片: { type:'message', content: text + '\n[File: /path]', session_id }

后端 WS 处理（_process_ws_message）
  → 解析 data.images → 保存到 uploads/ → 生成 [Image: /path] 标记
  → effective_text = content + '\n[Image: ...]' + '\n[File: ...]'
  → agent.process_message(message=effective_text)

agent._build_user_content
  → [File: /path]: 读取文件内容（<64K）→ 附加到消息文本
  → [Image: /path]:
    - vision_client 可用: 调用 vision API 描述图片 → 返回描述文本
    - 无 vision_client: 返回文件信息文本（LongCat-2.0-Preview 不支持多模态）

后端 WS 响应（stream_end / response）
  → d.data.attachments → meta.attachments → addMsg(text, 'agent', meta)
  → buildAttachmentsHtml() → 气泡内渲染图片/文件
```

## ⚠️ WS 消息必须包含 images 字段（v0.9.23+）

前端上传图片文件后，必须通过 WS 消息的 `images` 字段传递 base64 数据：

```js
const msgPayload = { type: 'message', content: text, session_id: currentSession };
if (images.length > 0) msgPayload.images = images;
ws.send(JSON.stringify(msgPayload));
```

后端 `_process_ws_message` 解析 `data.images` 保存图片到 uploads/，并生成 `[Image: /path]` 标记。**如果前端只传 `[Image: /path]` 文本而不传 `images` 字段，后端不会保存图片，agent 只收到路径文本。**

## ⚠️ LongCat-2.0-Preview 不支持多模态（v0.9.23+）

LongCat-2.0-Preview 不支持 `image_url` 格式的多模态输入。`_build_user_content` 的 fallback 路径（无 vision_client 时）将图片转为文本描述而非 base64 嵌入：

```
[图片文件: test.png - 1KB, 路径: /home/gavin/.siper/uploads/test.png]
```

如需图片理解能力，必须配置 vision_client（SENSENOVA_API_KEY 环境变量）。

## category 分类规则

`getFileCategory(name)` 根据扩展名返回：`image`、`document`、`code`、`archive`、`audio`、`video`、`other`

图片类别渲染为缩略图，其他类别渲染为文件引用（图标 + 文件名）。

## 关键 CSS 类

| 类名 | 用途 | 位置 |
|------|------|------|
| `.file-preview-item` | 输入区每个文件预览容器 | 输入区 |
| `.file-preview-item.has-thumb` | 图片类预览（padding 更小） | 输入区 |
| `.file-preview-thumb` | 输入区图片缩略图（80×80, object-fit: cover） | 输入区 |
| `.file-icon` | 非图片文件图标（emoji, 28px） | 输入区 |
| `.file-name` | 文件名标签（10px, 截断） | 输入区 |
| `.remove-file` | 删除按钮（右上角圆形） | 输入区 |
| `.chat-image` | 消息气泡内图片（max 240×200, border） | 气泡内 |
| `.chat-file-ref` | 消息气泡内文件引用（图标+文件名） | 气泡内 |
| `.msg-attachments` | 气泡内附件容器（flex wrap, gap 8px） | 气泡内 |
| `.image-lightbox` | 图片放大弹窗 | 全局 |

## 安全要求

- `escapeHtml()` 用于文件名（防 XSS）
- 图片 src 使用后端返回的 URL 或 FileReader dataURL（不拼接用户输入路径）
- `/api/upload` 由后端负责路径安全检查

## 常见陷阱

1. **CSS 缺失导致静默失败**：JS 有完整渲染逻辑但 CSS 不存在时，缩略图不可见但无 JS 错误。排查时先检查 CSS 类是否存在：`curl -s http://127.0.0.1:9724/static/style.css | grep -c 'chat-image\|file-preview-thumb'`

2. **`addMsg` 用 `textContent` 渲染文本**：纯文本模式下 `body.textContent = text` 不会解析 HTML。附件需要单独创建 DOM 元素 append 到 bubble（`buildAttachmentsHtml()` 函数）。

3. **`stream_end` 不经过 `addMsg`**：流式结束时 core.js 直接操作 `_streamBubble` DOM，附件需要在 `stream_end` 处理里单独 append（不能用 `addMsg` 的附件渲染逻辑）。

4. **`addMsgHtml` 缺少 `msg-body` 包裹**：早期 `addMsgHtml` 直接 `bubble.innerHTML = html`，没有 `msg-body` 包裹和时间戳。修复后 user 分支加上了。

5. **后端不带 `attachments` 字段**：当前后端 WS 消息不包含 `attachments`，所以 AI 回复不会显示附件。只有用户发送的消息（前端直接渲染）能显示附件。如需 AI 回复带附件，需修改 `siper_web.py`。

6. **WS 消息缺少 images 字段（v0.9.23）**：前端上传图片后只拼接 `[Image: /path]` 到 content 文本，不传 `images` 字段。后端 `_process_ws_message` 不会保存图片文件，agent 收到的只是路径文本，无法读取图片内容。修复：前端必须传 `images: [{data, name, mime}]`。

7. **LongCat 不支持多模态（v0.9.23）**：即使把图片 base64 嵌入到 content 数组中，LongCat-2.0-Preview 也无法理解。fallback 改为文本文件信息描述。配置 SENSENOVA_API_KEY 可启用 vision_client 进行图片分析。

## 调试技巧：拦截 WS 消息

在浏览器控制台安装 WS send 拦截器，检查实际发送的消息内容：

```js
const origSend = ws.send.bind(ws);
window._wsLog = [];
ws.send = function(data) {
  const parsed = JSON.parse(data);
  window._wsLog.push(parsed);
  return origSend(data);
};
// 发送后检查: _wsLog[_wsLog.length-1]
```

## Lightbox

`openImageLightbox(src, name)` 使用 `#imageLightbox` 弹窗（index.html 内联），点击缩略图放大查看原图。

## 验证方法

1. 上传图片文件 → 输入区显示缩略图
2. 发送消息 → 气泡内显示图片（`.chat-image`）
3. 上传非图片文件 → 气泡内显示文件引用（`.chat-file-ref`）
4. 点击图片 → 打开 lightbox 弹窗
5. 浏览器控制台零 JS 错误
6. WS 消息包含 `images` 字段（图片）或 `content` 包含 `[File: /path]`（非图片）
