#!/bin/bash
# SiPer 服务管理脚本
# 用法: ./siper.sh {start|stop|restart|status|log}

set -e

PROJECT_DIR="/home/gavin/.siper"
PYTHON="${PROJECT_DIR}/.venv/bin/python"
MAIN_FILE="siper_web.py"
PID_FILE="$PROJECT_DIR/.siper.pid"
LOG_FILE="/tmp/siper_file.log"
STARTUP_LOG="/tmp/siper_startup.log"
PORT=9724

# 从 startup.log 提取 ✔/❌/⚠/⏳ 行并格式化显示
_show_progress() {
    if [ -f "$STARTUP_LOG" ]; then
        grep -E '^[[:space:]]*[✔❌⚠⏳]' "$STARTUP_LOG" | tail -20
    fi
}

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
    # 清空启动日志，启动时同时写文件和 stdout
    > "$STARTUP_LOG"
    $PYTHON -u "$MAIN_FILE" >> "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"

    # 等待服务就绪，期间显示进度
    local retry=0
    local last_shown=""
    while [ $retry -lt 30 ]; do
        if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
            # 等待启动验证完成（最多 5 秒）
            local vretry=0
            while [ $vretry -lt 10 ]; do
                if grep -q '启动验证:' "$STARTUP_LOG" 2>/dev/null; then
                    break
                fi
                sleep 0.5
                vretry=$((vretry + 1))
            done
            # 内存写入（按实际启动顺序）
            echo "内存写入："
            grep -E '✔ (模型|Agent|LLM|Token|内存)' "$STARTUP_LOG" 2>/dev/null
            echo ""

            # 启动验证
            echo "启动验证："
            local verify_line
            verify_line=$(grep -E '✔ 启动验证' "$STARTUP_LOG" 2>/dev/null | tail -1)
            if [ -n "$verify_line" ]; then
                echo "$verify_line"
            else
                echo "(等待中...)"
            fi
            echo ""

            echo "✅ SiPer 运行中 (PID: $pid)"
            echo ""
            echo "🌐 前端地址：http://localhost:$PORT"
            echo ""
            return 0
        fi
        # 有新进度行时实时显示
        local current
        current=$(_show_progress | tail -1)
        if [ -n "$current" ] && [ "$current" != "$last_shown" ]; then
            echo "$current"
            last_shown="$current"
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
    kill "$pid" 2>/dev/null || true

    # 等待进程退出
    local retry=0
    while [ $retry -lt 10 ]; do
        if ! pgrep -f "$MAIN_FILE" > /dev/null 2>&1; then
            echo "✔ 进程已停止"
            break
        fi
        sleep 0.5
        retry=$((retry + 1))
    done

    # 等待端口释放
    retry=0
    while [ $retry -lt 10 ]; do
        if ! ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
            echo "✔ 端口 $PORT 已释放"
            break
        fi
        sleep 0.5
        retry=$((retry + 1))
    done

    # 清理 PID 文件
    rm -f "$PID_FILE"
    echo "✔ PID 文件已清理"
    echo "✅ SiPer 已停止"
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
