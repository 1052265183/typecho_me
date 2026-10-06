#!/usr/bin/env bash
# 正式环境备份：数据库 + 用户上传数据。
#
# 为什么必须做：正式环境现在跑在个人电脑上（WSL 原生 php -S + 本机 MySQL 容器），
# 机器故障 / 误删 / 勒索全靠自己兜底。远程服务器时代有别人替你扛这一层，现在没有了。
#
# 两类数据分开处理，策略不同：
#   - 数据库：体积小（11.55MB）、每日全量 dump，保留 14 天，直接可读可恢复；
#   - uploads：体积大（1.6GB / 832 文件）、用 --link-dest 硬链接做增量快照，
#     每日只存变化量，天然去重，且任意一天的快照都是完整可还原的。
#
# 用法：
#   bash .claude/scripts/_backup_prod.sh          # 执行一次备份
#   bash .claude/scripts/_backup_prod.sh --list   # 列出已有备份
#   bash .claude/scripts/_backup_prod.sh --prune  # 只清理超出保留期的备份

set -euo pipefail

DOCROOT="/root/www/typecho_prod"
UPLOADS="$DOCROOT/usr/uploads"
BACKUP_ROOT="/root/backups/typecho"
DB_DIR="$BACKUP_ROOT/db"
UP_DIR="$BACKUP_ROOT/uploads"
ENV_FILE="/www/dk_project/dk_app/typecho/typecho_AGbF/.env"
DB_FILTER="name=mysql_WLZr"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
TODAY="$(date +%Y%m%d)"

getval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }

dump_db() {
    local db_id db_user db_pass db_name out
    # 两个坑叠在一起：
#   1) `head -1` 会提前关闭管道，docker 收到 SIGPIPE，pipefail 下结果为空；
#   2) docker 的 --filter name= 是区分大小写的子串匹配，而容器名实为
#      mysql_wlzr-mysql_WLZr-1（项目段小写 wlzr，服务段大写 WLZr），
#      按大写写 filter 会匹配不到。
# 所以这里不依赖 docker 的 filter，直接对 Names 列做匹配。
    db_id="$(docker ps -a --format '{{.ID}} {{.Names}}' | awk '/mysql_wlzr/ {print $1; exit}')"
    [[ -n "$db_id" ]] || { echo "找不到数据库容器"; return 1; }
    db_user="$(getval MYSQL_USER)"; db_pass="$(getval MYSQL_PASSWORD)"; db_name="$(getval MYSQL_DATABASE)"

    mkdir -p "$DB_DIR"
    out="$DB_DIR/${TODAY}_${STAMP}.sql.gz"
    # --no-tablespaces：应用用户没有 PROCESS 权限，不加会报
    # "Access denied; you need the PROCESS privilege"（不影响表数据，但会污染输出）
    docker exec -e MYSQL_PWD="$db_pass" "$db_id" \
        mysqldump -u"$db_user" -h127.0.0.1 -P3306 --single-transaction \
        --skip-lock-tables --no-tablespaces --default-character-set=utf8mb4 "$db_name" \
        | gzip -9 > "$out"
    echo "数据库已备份: $out ($(du -h "$out" | cut -f1))"

    # 保留期清理（SQL 文件的 mtime 就是创建时间，可直接用 find）
    find "$DB_DIR" -name '*.sql.gz' -mtime "+$KEEP_DAYS" -delete
}

snapshot_uploads() {
    mkdir -p "$UP_DIR"
    local dest="$UP_DIR/$STAMP"
    # --link-dest 指向当天已有的快照：未变化的文件用硬链接指过去，不占额外空间
    local linkdest=""
    linkdest="$(find "$UP_DIR" -maxdepth 1 -mindepth 1 -type d | sort | tail -1)"
    if [[ -n "$linkdest" ]]; then
        rsync -a --delete --link-dest="$linkdest" "$UPLOADS/" "$dest/"
    else
        rsync -a "$UPLOADS/" "$dest/"
    fi
    # 必须 touch：rsync -a 会把源目录的 mtime 一并保留下来，而源 uploads 目录的
    # mtime 是「最后一次上传」的时间（可能远早于今天）。若不重置，下面按
    # `-mtime +7` 清理时会把刚建的快照当成陈旧项当场删掉——曾因此丢过一次快照。
    touch "$dest"
    echo "uploads 快照: $dest (实际占用 $(du -sh "$dest" | cut -f1))"

    # 只保留最近 7 天的 uploads 快照
    find "$UP_DIR" -maxdepth 1 -mindepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
}

list_backups() {
    echo "=== 数据库备份 ($DB_DIR) ==="
    ls -lh "$DB_DIR" 2>/dev/null | tail -10 || echo "（无）"
    echo
    echo "=== uploads 快照 ($UP_DIR) ==="
    ls -lh "$UP_DIR" 2>/dev/null | tail -10 || echo "（无）"
    echo
    echo "=== 总占用 ==="
    du -sh "$BACKUP_ROOT" 2>/dev/null || echo "（无）"
}

case "${1:-run}" in
    run)   mkdir -p "$BACKUP_ROOT"; dump_db; snapshot_uploads; list_backups ;;
    --list)   list_backups ;;
    --prune)  find "$DB_DIR" -name '*.sql.gz' -mtime "+$KEEP_DAYS" -delete
              find "$UP_DIR" -maxdepth 1 -mindepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
              echo "清理完成" ;;
    *) echo "用法: $0 [run|--list|--prune]"; exit 1 ;;
esac