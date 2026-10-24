#!/usr/bin/env bash
# 安装 / 卸载正式环境的 systemd 自启单元。
#
# 目标：WSL 一旦启动，正式环境自动就绪——不配置 Windows 开机自启。
# （Windows 是否自动拉起 WSL 由用户自行决定，不在本脚本范围内。）
#
# 用法：
#   bash .claude/scripts/_install_prod_systemd.sh           # 安装并启动
#   bash .claude/scripts/_install_prod_systemd.sh --remove  # 卸载
#   bash .claude/scripts/_install_prod_systemd.sh --status  # 查看状态
#
# 关键冲突点：_prod_ctl.sh 用手工 setsid + PID 文件启动同端口的服务。
# 两者并存会抢 8001 端口，所以安装前必须先停掉手工起的那个。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SRC="$SCRIPT_DIR/systemd"
UNIT_DIR="/etc/systemd/system"
WAITDB_BIN="/usr/local/bin/typecho-prod-wait-db"
DOCROOT="/root/www/typecho_prod"
PORT=8001

need_root() {
    if [[ "$(id -u)" -ne 0 ]]; then
        echo "需要 root 权限运行"; exit 1
    fi
}

install_units() {
    need_root

    # 1. 停掉手工启动的同端口服务，否则 systemd 启动时会因端口占用失败
    if [[ -f "$SCRIPT_DIR/_prod_ctl.sh" ]]; then
        bash "$SCRIPT_DIR/_prod_ctl.sh" stop > /dev/null 2>&1 || true
    fi
    # 兜底：按端口清场（只匹配以 php 开头的进程，不会误杀执行本脚本的 shell）
    pkill -f "^php -S 0\.0\.0\.0:$PORT" 2>/dev/null || true

    # 2. 装等待数据库的辅助脚本
    install -m 0755 "$UNIT_SRC/typecho-prod-wait-db" "$WAITDB_BIN"

    # 3. 装单元文件
    install -m 0644 "$UNIT_SRC/typecho-prod.service"     "$UNIT_DIR/typecho-prod.service"
    install -m 0644 "$UNIT_SRC/typecho-backup.service"   "$UNIT_DIR/typecho-backup.service"
    install -m 0644 "$UNIT_SRC/typecho-backup.timer"     "$UNIT_DIR/typecho-backup.timer"

    # 4. 启用并启动
    systemctl daemon-reload
    systemctl enable --now typecho-prod.service
    systemctl enable --now typecho-backup.timer

    echo
    echo "=== 安装完成 ==="
    systemctl --no-pager --lines=0 status typecho-prod.service | head -6 || true
    echo
    systemctl list-timers typecho-backup.timer --no-pager || true
}

remove_units() {
    need_root
    systemctl disable --now typecho-prod.service 2>/dev/null || true
    systemctl disable --now typecho-backup.timer 2>/dev/null || true
    rm -f "$UNIT_DIR/typecho-prod.service" "$UNIT_DIR/typecho-backup.service" \
          "$UNIT_DIR/typecho-backup.timer" "$WAITDB_BIN"
    systemctl daemon-reload
    echo "已卸载。若需手工启动，用 bash $SCRIPT_DIR/_prod_ctl.sh start"
}

status_units() {
    echo "=== typecho-prod.service ==="
    systemctl --no-pager --lines=8 status typecho-prod.service 2>&1 | head -14 || true
    echo
    echo "=== 端口 ==="
    ss -tlnp 2>/dev/null | grep ":$PORT" || echo "端口 $PORT 未监听"
    echo
    echo "=== 备份定时器 ==="
    systemctl list-timers typecho-backup.timer --no-pager 2>&1 | head -4 || true
    echo
    echo "=== 自启是否已启用 ==="
    systemctl is-enabled typecho-prod.service 2>&1 || true
}

case "${1:-install}" in
    --remove) remove_units ;;
    --status) status_units ;;
    *)        install_units ;;
esac