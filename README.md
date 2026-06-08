# SiPer AI Agent

一个独立的 AI Agent 框架 — 多模型 · 多技能 · 多智能体 · Web UI。

核心仅依赖 `openai` + `websockets` + `jinja2`，23 个工具中 21 个纯 stdlib。

## 功能

- **多模型 LLM**：OpenAI 兼容接口，支持多 Provider、多模型切换
- **流式响应**：WebSocket 实时流式输出
- **23 个内置工具**：文件操作、代码执行、网络搜索、浏览器控制、技能系统、记忆系统
- **技能系统**：自动加载 SKILL.md、语义预筛选、上下文注入
- **多智能体**：独立配置、独立会话、独立 SOUL/Agent 定义
- **Web UI**：内置完整管理界面，实时聊天、配置管理、Token 统计
- **会话持久化**：SQLite + WAL 模式

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/gavin-jack/siper-agent.git
cd siper-agent

# 安装依赖（仅 3 个包）
pip3 install -r requirements.txt

# 首次启动（自动生成配置文件）
python3 siper_web.py
```

启动后访问 **http://localhost:9724**

## 目录结构

```
siper-agent/
├── siper_web.py              # 主入口（WS 服务器 + HTTP + 路由）
├── requirements.txt          # Python 依赖
├── ai_agent/                 # Agent 核心
│   ├── core/                 #   agent.py + llm_client.py
│   ├── tools/                #   23 个工具实现
│   ├── skills/               #   技能系统
│   ├── sessions/             #   会话管理
│   └── utils/                #   工具类
├── webui/                    # Web 前端
│   ├── src/                  #   ESM 模块化 JS（28 个文件）
│   ├── static/               #   静态资源（echarts、头像）
│   └── templates/            #   index.html
├── skills/                   # 内置技能
└── scripts/                  # 部署脚本
```

## 配置文件

首次启动时自动生成，无需手动创建：

| 文件 | 说明 |
|------|------|
| `models.json` | LLM 提供商和模型定义 |
| `settings.json` | 系统参数（端口、心跳、日志等） |
| `agents/{name}/sessions.db` | 会话数据库（运行时生成） |

## License

MIT License — 详见 [LICENSE](LICENSE)
