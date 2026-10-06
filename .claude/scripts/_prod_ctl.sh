#!/usr/bin/env bash
# 本机正式环境（WSL 原生）服务控制脚本。
#
# 为什么不用 php-fpm/nginx：Typecho 的 rewrite=0，永久链接形如
# `/index.php/archives/1/`，靠 PATH_INFO 路由；php -S 本身不支持，
# 由 router.php 补上。自用场景不需要再装一套 nginx + php-fpm。
#
# 为什么必须写成脚本而不是一行命令：
#   `pkill -f 'php -S 0.0.0.0:8001'` 会连执行它的 shell 一起杀掉——
#   因为那条 shell 的命令行里同样含这个字符串。
#   这里用 PID 文件停进程，彻底避开该陷阱。
#
# 用法：bash .claude/scripts/_prod_ctl.sh {start|stop|restart|status|log}

set -euo pipefail

DOCROOT="/root/www/typecho_prod"
PORT="8001"
PIDFILE="/run/typecho-prod.pid"
LOGFILE="/tmp/typecho-prod.log"
WORKERS="${PHP_CLI_SERVER_WORKERS:-4}"

start() {
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "已在运行（PID $(cat "$PIDFILE")）"; return 0
    fi
    cd "$DOCROOT"
    # WORKERS 让内置服务器起多个 worker，避免单线程被慢请求（如图片代理）阻塞
    PHP_CLI_SERVER_WORKERS="$WORKERS" setsid nohup php -S "0.0.0.0:$PORT" -t . router.php \
        > "$LOGFILE" 2>&1 < /dev/null &
    echo $! > "$PIDFILE"
    sleep 2
    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "已启动（PID $(cat "$PIDFILE")，端口 $PORT，worker $WORKERS）"
    else
        echo "启动失败，日志："; tail -20 "$LOGFILE"; return 1
    fi
}

stop() {
    if [[ -f "$PIDFILE" ]]; then
        PID="$(cat "$PIDFILE")"
        # setsid 让 php 成为新会话组长，负号杀整个进程组，连 worker 一起收
        kill -TERM -"$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
        rm -f "$PIDFILE"
        echo "已停止（PID $PID）"
    else
        echo "PID 文件不存在，按端口兜底查找"
        # 端口兜底：只匹配以 php 开头的进程，不匹配执行本脚本的 shell
        pkill -f '^php -S 0\.0\.0\.0:'"$PORT" || echo "未找到运行中的服务"
    fi
}

status() {
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "运行中（PID $(cat "$PIDFILE")）"
    else
        echo "未运行"
    fi
    echo "--- 监听端口 ---"
    ss -tlnp 2>/dev/null | grep ":$PORT" || echo "端口 $PORT 未监听"
}

case "${1:-status}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; sleep 1; start ;;
    status)  status ;;
    log)     tail -n "${2:-40}" "$LOGFILE" ;;
    *)       echo "用法: $0 {start|stop|restart|status|log}"; exit 1 ;;
esac