# APK Assets 文件完整性清单

## 问题

构建 Android APK 后，Python 后端启动失败，因为 APK assets 中缺少必要文件。

## 最小文件清单

`android/app/src/main/assets/public/` 下必须有：

```
public/
├── siper_web.py              # Python HTTP 服务器（主入口）
├── siper_main.py             # Chaquopy 入口（启动 siper_web）
├── settings.json             # 网关配置（端口等）
├── models.json               # 模型配置（可为空 {}）
├── ai_agent/                 # Agent 核心
│   ├── __init__.py
│   ├── core/
│   │   ├── agent.py
│   │   └── llm_client.py     # 必须用 httpx 版（非 openai SDK）
│   ├── skills/
│   │   ├── __init__.py
│   │   └── skill_loader.py
│   ├── sessions/
│   │   ├── __init__.py
│   │   └── session_manager.py
│   ├── tools/
│   │   ├── tool_registry.py
│   │   └── ...（其他工具）
│   └── utils/
│       └── ...
├── agents/
│   └── default/
│       └── config.json       # Agent 配置（可为空 {}）
├── skills/                   # Skill 文件
│   ├── __init__.py
│   └── ...（skill .py 文件）
├── webui/
│   ├── __init__.py
│   ├── task_manager.py
│   ├── templates/
│   │   └── index.html        # Jinja2 模板（必须存在）
│   └── static/
│       ├── style.css
│       ├── favicon.ico
│       ├── default_avatar.png
│       ├── i18n/
│       │   └── log-i18n.json
│       └── pages/            # 前端 JS（siper_web 静态文件路由引用）
│           ├── core.js
│           ├── main.js
│           ├── page-chat.js
│           └── ...（其他 page-*.js）
├── index.html                # 前端主页（独立于模板）
├── style.css                 # 前端 CSS（独立版）
├── pages/                    # 前端 JS（独立版）
│   ├── core.js
│   ├── main.js
│   └── ...（其他 page-*.js）
└── siper-bridge.js           # 移动端桥接（可选）
```

## 注意

- `webui/static/` 下的文件是 siper_web.py 静态文件路由引用的
- `index.html`、`style.css`、`pages/` 是前端实际加载的（扁平路径）
- 两套文件可以共存，各走各的路
- `webui/templates/index.html` 必须存在（jinja2 初始化时加载），即使前端不用它

## 复制命令

```bash
# 从开发环境复制到 APK assets
DEV=~/.siper
DST=~/siper-mobile/android/app/src/main/assets/public

# 核心文件
cp $DEV/siper_web.py $DST/
cp $DEV/settings.json $DST/
cp $DEV/models.json $DST/

# ai_agent
cp -r $DEV/ai_agent $DST/

# agents/default
mkdir -p $DST/agents/default
cp $DEV/agents/default/config.json $DST/agents/default/

# skills
cp -r $DEV/skills $DST/

# webui
cp -r $DEV/webui/templates $DST/webui/
cp -r $DEV/webui/static $DST/webui/

# 清理 __pycache__
find $DST -name "__pycache__" -type d -exec rm -rf {} +
```

## 验证

```bash
# 列出 APK 中所有 .py 文件
python3 -c "
import zipfile
z = zipfile.ZipFile('app-debug.apk')
for n in sorted(z.namelist()):
    if n.endswith('.py') and 'assets/public' in n:
        print(n)
"
```
