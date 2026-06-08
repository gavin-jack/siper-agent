# Jinja2 模板渲染（v0.4.27+）

## 架构变更

从"启动时预读 HTML 到内存"改为"每次请求动态渲染 Jinja2 模板"。

## 文件位置

- 模板：`webui/templates/index.html`（从 `webui/index.html` 移入）
- 后端：`siper_web.py` 模块顶层创建 `_jinja_env`

## 关键代码

```python
# siper_web.py 顶部
import jinja2

TEMPLATE_DIR = PROJECT_ROOT / "webui" / "templates"
_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(TEMPLATE_DIR)),
    auto_reload=True,  # 开发模式：自动检测模板文件变更
    enable_async=False,
)
_version = int(time.time())  # Cache-buster for JS/CSS


def _render_index() -> str:
    """Render index.html template with dynamic variables."""
    template = _jinja_env.get_template("index.html")
    html = template.render(
        version=_version,
        siper_version="v0.4.27",
    )
    # cache-buster 正则替换（为 JS 文件注入 mtime 版本号）
    def _js_mtime(match: _re.Match) -> str:
        js_path = match.group(1)
        full = PROJECT_ROOT / "webui" / js_path.lstrip("/")
        if full.exists():
            return f'<script src="{js_path}?v={int(os.path.getmtime(full))}"></script>'
        return match.group(0)
    html = _re.sub(r'<script src="(/static/pages/[^"]+)"></script>', _js_mtime, html)
    return html
```

路由中：
```python
if path in ("/", "/index.html"):
    body_bytes = _render_index().encode("utf-8")
```

## 模板变量

在 `index.html` 中可使用：
- `{{ version }}` — 启动时间戳（用于 CSS cache-buster）
- `{{ siper_version }}` — 版本号字符串（如 "v0.4.27"）

## 注意事项

1. `auto_reload=True` 仅用于开发模式，生产环境应设为 `False`
2. 模板语法 `{{ }}` 和 `{% %}` 不能出现在纯 CSS/JS 内容中（会报 TemplateSyntaxError）
3. cache-buster 正则替换必须在 `_render_index()` 内部完成（不能在模块顶层，因为 `html_content` 不再存在）
4. 移除了旧代码中的 `HTML_PATH`、`html_content` 全局变量、以及 main() 中的读文件+替换逻辑
