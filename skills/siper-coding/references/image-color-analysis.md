# 图片配色方案提取方法

当用户发送参考图片（如 UI 设计稿、配色方案截图）需要提取颜色时，使用以下流程：

## 适用场景
- 用户发送 UI 截图要求"用这个配色重做"
- 用户发送设计稿要求"参考这个风格"
- 需要从图片中提取主色调、强调色、背景色

## 方法

### 1. 获取图片
用户通常通过以下方式发送图片：
- 直接粘贴到聊天（图片上传到 `/home/gavin/.hermes-web-ui/upload/` 目录）
- 提供本地路径或 URL

### 2. 分析颜色
**注意**：`python -c` 内联脚本被安全策略拦截，必须用 `write_file` 写脚本再执行。

`execute_code` 工具可用（PIL 已安装），但复杂分析建议写脚本：

```python
from PIL import Image
from collections import Counter

img = Image.open('/path/to/image.png').convert('RGBA')
pixels = list(img.getdata())

# 主色调（量化后取 top N）
quantized = [(r//16*16, g//16*16, b//16*16) for r,g,b,a in pixels if a > 128]
counter = Counter(quantized)
for (r,g,b), count in counter.most_common(20):
    print(f"rgb({r},{g},{b}) #{r:02x}{g:02x}{b:02x}")

# 区域分析（顶部栏、侧边栏、主内容区等）
# 网格采样获取颜色分布
for y in range(0, height, 15):
    for x in range(0, width, 30):
        r,g,b,a = pixels[y*width+x]
        print(f"y={y}, x={x}: #{r:02x}{g:02x}{b:02x}")

# 非主色调（强调色、按钮色等）
for r,g,b,a in pixels:
    if a > 128 and not (is_cyan_ish):  # 排除主色
        collect(r,g,b)
```

### 3. 提取配色方案
从分析结果中提取：
- **背景色**：占比最大的颜色
- **面板/卡片色**：区域平均色或次主色
- **强调色/按钮色**：非主色调中的高饱和颜色
- **文字色**：深色区域（R+G+B < 300）
- **边框/分割线**：中间色调

### 4. 应用到 Siper CSS
将提取的颜色映射到 CSS 变量：
- `--bg-*` → 背景色
- `--card-bg` → 面板色
- `--accent-*` → 强调色
- `--text-*` → 文字色
- `--border-*` → 边框色

## 注意事项
- `read_file` 无法读取二进制文件（PNG/JPG），必须用 PIL 或 base64
- `browser_navigate` 打开本地图片路径无法渲染（空白页），只能通过 HTTP 服务或代码分析
- `execute_code` 环境有 PIL，可以直接使用
- 如果 `execute_code` 不可用，用 `write_file` 写脚本到 `/tmp/` 再用 `terminal` 执行

## 实例：青绿色系配色（2026-05-18）
从参考图提取的配色方案：
- 背景：#bee8e6（浅青绿/薄荷）
- 卡片/面板：#ddf0ec、#99dfe7
- 强调色：#7febd4（亮青绿/绿松石）、#83bbae
- 深色文字：#081613、#0e2622
- 近黑：#001010
