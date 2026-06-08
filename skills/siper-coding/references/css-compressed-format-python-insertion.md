# CSS 压缩文件格式陷阱

## 问题
SiPer 的 style.css 是压缩格式（每个 CSS 规则块一行，无换行缩进）。用 sed 插入多行内容会破坏压缩格式，导致 CSS 解析失败。

## 错误示例
```bash
# ❌ 错误：sed 插入多行破坏压缩格式
sed -i '/pattern/a\
.new-rule {\
  prop: value;\
}' style.css
```

## 正确方案
用 Python 文件 read/write 进行字符串替换：

```python
# ✅ 正确：Python 字符串替换
with open('webui/static/style.css', 'r') as f:
    css = f.read()

old = '}.msg-action-btn:active { transform: scale(0.92); }.chat-input-area {'
new = '''}.msg-action-btn:active { transform: scale(0.92); }
.chat-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 24px; background: var(--bg-sidebar);
  border-top: 1px solid var(--border);
}
.chat-input-area {'''

css = css.replace(old, new)

with open('webui/static/style.css', 'w') as f:
    f.write(css)
```

## 验证
插入后用浏览器加载页面确认样式正常，无 CSS 解析错误。
