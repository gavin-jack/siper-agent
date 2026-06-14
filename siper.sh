#!/bin/bash
# SiPer 服务管理脚本
# 用法: ./siper.sh {start|stop|restart|status|log}

set -e

PROJECT_DIR="/home/gavin/.siper"
PYTHON="/home/gavin/.hermes/hermes-agent/venv/bin/python3"
MAIN_FILE="siper_web.py"
PID_FILE="$PROJECT_DIR/.siper.pid"
LOG_FILE="/tmp/siper_file.log"
STARTUP_LOG="/tmp/siper_startup.log"
PORT=9724

get_pid() {
    pgrep -f "$MAIN_FILE" 2>/dev/null | head -1
}

is_running() {
    local pid=$(get_pid)
    [ -n "$pid" ]
}

start() {
    if is_running; then
        echo "SiPer 已在运行 (PID: $(get_pid))"
        return 0
    fi

    echo "启动 SiPer..."
    cd "$PROJECT_DIR"
    $PYTHON -u "$MAIN_FILE" >> "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"
    echo "SiPer 已启动 (PID: $pid)"

    # 等待服务就绪
    local retry=0
    while [ $retry -lt 30 ]; do
        if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
            echo "服务已就绪 (端口 $PORT)"
            return 0
        fi
        sleep 0.5
        retry=$((retry + 1))
    done

    echo "警告: 服务启动超时，请检查日志"
    return 1
}

stop() {
    local pid=$(get_pid)
    if [ -z "$pid" ]; then
        echo "SiPer 未运行"
        return 0
    fi

    echo "停止 SiPer (PID: $pid)..."
    kill -9 "$pid" 2>/dev/null
    rm -f "$PID_FILE"

    # 等待端口释放
    local retry=0
    while [ $retry -lt 10 ]; do
        if ! ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
            echo "服务已停止"
            return 0
        fi
        sleep 0.5
        retry=$((retry + 1))
    done

    echo "端口未释放，尝试强制清理..."
    pkill -9 -f "$MAIN_FILE" 2>/dev/null
    rm -f "$PID_FILE"
}

restart() {
    echo "重启 SiPer..."
    stop
    sleep 2
    start
}

status() {
    if is_running; then
        echo "SiPer 运行中 (PID: $(get_pid))"
        ss -tlnp 2>/dev/null | grep ":$PORT " || echo "端口 $PORT 未监听"
    else
        echo "SiPer 未运行"
        rm -f "$PID_FILE"
    fi
}

log() {
    if [ -f "$STARTUP_LOG" ]; then
        echo "=== 启动日志 ==="
        cat "$STARTUP_LOG"
    fi
    echo ""
    echo "=== 最近日志 (最后 50 行) ==="
    tail -50 "$LOG_FILE" 2>/dev/null
}

case "${1}" in
    start)   start   ;;
    stop)    stop    ;;
    restart) restart ;;
    status)  status  ;;
    log)     log     ;;
    *)
        echo "用法: $0 {start|stop|restart|status|log}"
        exit 1
        ;;
esac
