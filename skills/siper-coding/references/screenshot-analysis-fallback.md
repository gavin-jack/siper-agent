# 截图分析工具全部不可用时的替代方案（v0.9.80+）

## 问题描述

当用户上传截图要求分析时，可能遇到：
- `vision_analyze` 返回 403（模型区域不可用）
- `browser_vision` 返回 403（同上）

## 替代方案（按优先级）

### 1. browser_navigate + browser_snapshot
```python
browser_navigate(url="http://127.0.0.1:9724")  # 打开 SiPer 页面
# snapshot 会返回页面所有文本内容，包括消息、按钮、标题等
```

### 2. browser_console 执行 JS 查询 DOM
```python
browser_console(expression="document.querySelectorAll('.toast, .alert, .modal, .banner').length")
browser_console(expression="Array.from(document.querySelectorAll('.toast, .alert')).map(e => e.textContent)")
```

### 3. PIL 分析图片像素（针对小截图）
```python
from PIL import Image
img = Image.open('/path/to/screenshot.png')
# 放大便于查看
big = img.resize((img.width*8, img.height*8), Image.NEAREST)
big.save('/tmp/screenshot_x8.png')
# 分析深色像素分布识别文字区域
```

### 4. 请用户重新截图
如果以上方法都无法识别，请用户：
- 截一张更大的截图（至少 800×600）
- 或直接描述提示内容

## 注意事项

- browser tool 有独立 CSS 缓存，修改 style.css 后用户必须硬刷新（Ctrl+Shift+R）
- 小截图（如 243×266）文字难以直接识别，需要放大或多轮交互
