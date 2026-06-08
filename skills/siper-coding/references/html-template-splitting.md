# HTML 模板拆分模式

## 背景

Siper Web UI 原为单页应用（SPA），所有 13 个页面的 HTML 都在一个 864 行的 `index.html` 中，通过 JS 控制显示/隐藏。这种架构的问题：
- 文件过大，难以维护
- 页面间 HTML 重复（侧边栏、导航、公共元素）
- 删除页面时需要手动清理多处

## 拆分方案

### 1. 创建基础模板 `_base.html`

包含所有页面共享的元素：
- 侧边栏（头像、品牌、导航菜单、状态栏、设置面板）
- 确认弹窗（`#confirmOverlay`）
- 图片 lightbox（`#imageLightbox`）
- 公共脚本引用（`core.js` + `main.js`）

### 2. 为每个页面创建独立模板

每个页面模板通过 `{% extends "_base.html" %}` 继承基础模板，只需定义 `content` 和 `scripts` 两个块。

### 3. 添加页面路由映射

在 `siper_web.py` 中定义 `_PAGE_ROUTES` 字典，映射 URL 路径到 `(template_name, title, page_id)`。

### 4. 修改页面渲染逻辑

将原来的 `_render_index()` 替换为通用的 `_render_page(path)`，支持多页面路由。

### 5. 导航高亮

在 `_base.html` 中，nav-item 通过 `page` 变量自动高亮：`{{ 'active' if page == 'chat' else '' }}`。

## 关键要点

1. **Jinja2 继承**：`{% extends "_base.html" %}` 让每个页面模板共享侧边栏和公共元素
2. **Block 定义**：`{% block content %}` 和 `{% block scripts %}` 是页面特定的内容块
3. **Cache-buster**：每个页面模板都需要注入 JS 版本号（`?v=<mtime>`）
4. **旧版保留**：`index.html` 保留作为 SPA 备份，不影响当前架构
5. **无需重启**：修改模板文件后不需要重启服务（Jinja2 auto_reload=True）
6. **需要重启**：修改 `siper_web.py` 的路由映射后需要重启

## 模板文件清单

```
webui/templates/
├── _base.html           # 基础模板（侧边栏 + 公共元素）
├── chat.html            # 对话页面
├── sessions.html        # 会话管理
├── models.html          # 模型管理
├── tasks.html           # 定时任务
├── memory.html          # 记忆管理
├── skills.html          # 技能管理
├── logs.html            # 系统日志
├── token.html           # Token 用量
├── settings.html        # 全局设置
├── gateway.html         # 网关控制
├── agent-config.html    # 智能体配置
├── theme-settings.html  # 外观设置
└── index.html           # 旧版 SPA（保留备份）
```

## 陷阱

- **cache-buster 正则必须匹配所有 script 标签**：如果某个页面模板缺少 cache-buster 注入，JS 文件会缓存旧版本
- **page 变量必须传递给模板**：导航高亮依赖 `page` 变量，忘记传递会导致所有 nav-item 都不高亮
- **title 变量必须传递给模板**：页面标题通过 `title` 变量注入
- **旧版 index.html 中的 nav-item active 类**：如果保留 index.html，需要确保其 nav-item 没有默认 active 类（与多页面架构一致）
