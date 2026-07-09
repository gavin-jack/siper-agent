#!/bin/bash
# SiPer 快速重启脚本
# 用法: ./siper_restart.sh [端口，默认9724]

PORT=${1:-7240}
PROJECT_DIR="/home/gavin/.siper"
PYTHON="${PROJECT_DIR}/.venv/bin/python"

echo "=== SiPer 重启 (端口 $PORT) ==="

# 1. 强制杀掉所有 siper_web.py 进程（包括正在处理 LLM 调用的）
echo "[1/4] 终止旧进程..."
PIDS=$(pgrep -f "siper_web.py" 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "  找到 PID: $PIDS"
    # 先 SIGTERM，2秒后 SIGKILL
    echo "$PIDS" | xargs kill 2>/dev/null
    sleep 2
    echo "$PIDS" | xargs kill -9 2>/dev/null
    # 也杀残留的 python3 siper_web 进程
    pkill -9 -f "siper_web.py" 2>/dev/null
    sleep 1
else
    echo "  无运行中的进程"
fi

# 2. 强制释放端口（杀掉占用端口的任何进程）
echo "[2/4] 释放端口 $PORT..."
if command -v fuser &>/dev/null; then
    fuser -k "${PORT}/tcp" 2>/dev/null
    sleep 1
else
    # fallback: lsof + kill
    PIDS_ON_PORT=$(lsof -ti ":${PORT}" 2>/dev/null)
    if [ -n "$PIDS_ON_PORT" ]; then
        echo "  端口占用 PID: $PIDS_ON_PORT"
        echo "$PIDS_ON_PORT" | xargs kill -9 2>/dev/null
        sleep 1
    fi
fi

# 3. 清理 PID 文件
echo "[3/4] 清理 PID 文件..."
rm -f "$HOME/.siper/.siper.pid" 2>/dev/null

# 4. 启动新实例
echo "[4/4] 启动 SiPer..."
cd "$SIper_DIR" && $PYTHON siper_web.py "$PORT" > /tmp/siper_restart.log 2>&1 &
NEW_PID=$!
echo "  新 PID: $NEW_PID"

# 5. 等待端口可用（最多 60 秒）
echo "等待端口 $PORT 可用..."
for i in $(seq 1 60); do
    sleep 1
    if ! ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
        continue
    fi
    # 端口监听了，验证 HTTP
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✓ SiPer 重启成功！端口 $PORT HTTP $HTTP_CODE (${i}s)"
        exit 0
    fi
done

echo "✗ 端口 $PORT 在 60 秒内未就绪，检查 /tmp/siper_restart.log"
tail -20 /tmp/siper_restart.log 2>/dev/null
exit 1
