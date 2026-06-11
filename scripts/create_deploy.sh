#!/bin/bash
# SiPer Agent 打包脚本
# 用途：生成干净的发布包，去除敏感信息、运行时生成文件、对话记录

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NAME="siper-agent"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DIST_DIR="/tmp/${PROJECT_NAME}-dist-${TIMESTAMP}"
ARCHIVE="/tmp/${PROJECT_NAME}-${TIMESTAMP}.tar.gz"

echo "=== SiPer Agent 打包 ==="
echo "源目录: ${SCRIPT_DIR}"
echo "临时目录: ${DIST_DIR}"
echo ""

# 1. 创建干净的临时目录
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# 2. 使用 rsync 复制，排除不需要的文件
echo "[1/5] 复制源代码文件..."
rsync -a \
    --exclude='.git' \
    --exclude='.gitignore' \
    --exclude='__pycache__' \
    --exclude='**/__pycache__' \
    --exclude='**/*.pyc' \
    --exclude='.env' \
    --exclude='.siper.pid' \
    --exclude='models.json' \
    --exclude='settings.json' \
    --exclude='test_siper.py' \
    --exclude='.cleanup_backup' \
    --exclude='.tmp' \
    --exclude='tmp' \
    --exclude='uploads' \
    --exclude='data' \
    --exclude='agents/*/sessions.db' \
    --exclude='agents/*/sessions.db-*' \
    --exclude='agents/*/meta.json' \
    --exclude='agents/*/todos.json' \
    --exclude='agents/*/skill_stats.json' \
    --exclude='agents/token.db' \
    --exclude='agents/token.db-*' \
    --exclude='agents/*/memory' \
    --exclude='agents/*/config.json.bak' \
    --exclude='agents/*/soul.md.bak' \
    --exclude='skills/siper-coding/references' \
    --exclude='skills/siper-coding/scripts' \
    --exclude='skills/siper-coding/SKILL.md' \
    --exclude='webui/static/node_modules' \
    --exclude='webui/__pycache__' \
    --exclude='webui/static/package*.json' \
    --exclude='**/scripts' \
    --exclude='**/:Zone.Identifier' \
    "${SCRIPT_DIR}/" "${DIST_DIR}/"

# 3. 删除 agents 目录下的运行时生成文件
echo "[2/5] 清理运行时生成文件..."
rm -f "${DIST_DIR}/agents/default/sessions.db"*
rm -f "${DIST_DIR}/agents/default/sessions.db-"*
rm -f "${DIST_DIR}/agents/default/meta.json"
rm -f "${DIST_DIR}/agents/default/todos.json"
rm -f "${DIST_DIR}/agents/default/skill_stats.json"
rm -f "${DIST_DIR}/agents/default/config.json.bak"
rm -f "${DIST_DIR}/agents/default/soul.md.bak"
rm -rf "${DIST_DIR}/agents/default/memory"
rm -f "${DIST_DIR}/agents/token.db"*
rm -f "${DIST_DIR}/agents/company-researcher/.gitkeep" 2>/dev/null || true

# 4. 创建干净的默认配置文件模板
echo "[3/5] 生成默认配置文件模板..."

cat > "${DIST_DIR}/settings.json.template" << 'SETTINGS_EOF'
{
  "agent": {
    "id": "primary",
    "name": "AI Agent",
    "max_concurrent_tools": 5,
    "fallback_providers": [],
    "memory_backend": "sqlite",
    "session_timeout": 3600,
    "enable_logging": true,
    "log_level": "INFO",
    "skills_dir": "./skills",
    "data_dir": "./data"
  },
  "system": {
    "log_buffer_size": 2000,
    "token_usage_max": 500,
    "session_list_limit": 50,
    "ws_heartbeat_timeout": 300,
    "context_window_default": 8192
  },
  "tools": {
    "rate_limit": {
      "requests_per_minute": 60,
      "requests_per_hour": 1000,
      "burst_size": 10
    }
  },
  "gateway": {
    "cli": { "enabled": true },
    "webui": { "enabled": true, "host": "localhost", "port": 9724 }
  },
  "orchestration": {
    "default_workers": 2,
    "task_timeout": 300
  }
}
SETTINGS_EOF

cat > "${DIST_DIR}/models.json.template" << 'MODELS_EOF'
{
  "version": 2,
  "providers": {
    "": {
      "base_url": "https://api.example.com/v1",
      "api_key": "YOUR_API_KEY_HERE",
      "models": [
        {
          "id": "your-model-id",
          "name": "Your Model Name",
          "alias": "",
          "provider": "",
          "base_url": "https://api.example.com/v1",
          "api_key": "YOUR_API_KEY_HERE",
          "context_window": 131072,
          "capabilities": ["chat", "function_calling", "reasoning", "code"],
          "is_default": true
        }
      ]
    }
  },
  "default_provider": "",
  "default_model": "your-model-id"
}
MODELS_EOF

cat > "${DIST_DIR}/.env.template" << 'ENV_EOF'
# SiPer Agent 环境变量配置
# 复制此文件为 .env 并填入实际的 API Key
LONGCAT_API_KEY=YOUR_API_KEY_HERE
ENV_EOF

mkdir -p "${DIST_DIR}/agents/default"
cat > "${DIST_DIR}/agents/default/config.json.template" << 'AGENTCONFIG_EOF'
{
  "name": "default",
  "icon": "🎭",
  "avatar": "agents/default/avatar.png",
  "tags": ["default"],
  "memory_integration": {
    "mode": "append",
    "position": "after_system",
    "max_tokens": 20000
  },
  "appearance": {
    "msg_font_size": "18px",
    "msg_bg": "#1c2333",
    "msg_text": "#e6edf3",
    "msg_border": "#30363d"
  },
  "session_timeout": 3600,
  "max_tools": 300,
  "max_tool_rounds": 100,
  "available_models": ["your-model-id"],
  "default_chat_model": "your-model-id",
  "default_vision_model": "your-model-id"
}
AGENTCONFIG_EOF

cat > "${DIST_DIR}/agents/default/skill_config.json.template" << 'SKILLCONFIG_EOF'
{
  "version": 1,
  "pre_filter": {
    "enabled": true,
    "top_k": 10,
    "min_score": 0.1,
    "fallback_threshold": 3
  },
  "injection": {
    "format": "text",
    "include_capabilities": true,
    "max_skill_index_tokens": 1000
  },
  "feedback": {
    "enabled": true,
    "stats_file": "skill_stats.json",
    "decay_factor": 0.95,
    "min_samples": 5
  },
  "gating": {
    "check_tools": true,
    "check_env": false,
    "check_bins": false,
    "check_platform": false
  },
  "entries": {}
}
SKILLCONFIG_EOF

# 5. 删除原始的敏感配置文件（保留模板）
echo "[4/5] 移除敏感配置文件..."
rm -f "${DIST_DIR}/settings.json"
rm -f "${DIST_DIR}/models.json"
rm -f "${DIST_DIR}/.env"
rm -f "${DIST_DIR}/agents/default/config.json"
rm -f "${DIST_DIR}/agents/default/skill_config.json"
rm -f "${DIST_DIR}/agents/default/memory.md"
rm -f "${DIST_DIR}/agents/company-researcher/config.json"

# 6. 创建安装说明
cat > "${DIST_DIR}/INSTALL.md" << 'INSTALL_EOF'
# SiPer Agent 安装指南

## 快速开始

1. 解压发布包
   ```bash
   tar xzf siper-agent-*.tar.gz
   cd siper-agent
   ```

2. 安装依赖
   ```bash
   pip3 install -r requirements.txt
   ```

3. 配置（复制模板文件并编辑）
   ```bash
   cp .env.template .env
   cp models.json.template models.json
   cp settings.json.template settings.json
   cp agents/default/config.json.template agents/default/config.json
   cp agents/default/skill_config.json.template agents/default/skill_config.json
   ```

4. 启动服务
   ```bash
   nohup python3 siper_web.py > /dev/null 2>&1 &
   ```

5. 访问 http://localhost:9724

## 配置文件

| 文件 | 用途 |
|------|------|
| `.env` | API Key |
| `models.json` | LLM 提供商和模型 |
| `settings.json` | 系统参数 |
| `agents/default/config.json` | 智能体配置 |
| `agents/default/skill_config.json` | 技能配置 |
INSTALL_EOF

# 7. 打包
echo "[5/5] 打包..."
cd "$(dirname "${DIST_DIR}")"
tar czf "${ARCHIVE}" "$(basename "${DIST_DIR}")"

# 8. 清理临时目录
rm -rf "${DIST_DIR}"

# 9. 输出结果
echo ""
echo "=== 打包完成 ==="
echo "输出文件: ${ARCHIVE}"
echo "文件大小: $(du -sh "${ARCHIVE}" | cut -f1)"
echo "文件数量: $(tar tzf "${ARCHIVE}" | wc -l)"
echo ""
echo "内容结构:"
tar tzf "${ARCHIVE}" | sed 's|^[^/]*/||' | sort | head -60
