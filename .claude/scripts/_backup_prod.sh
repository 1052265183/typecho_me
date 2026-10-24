#!/usr/bin/env bash
# 正式环境备份：数据库 + 用户上传文件，落 Windows 盘 F:\1A开发备份\博客备份。
#
# 设计要点（每条都对应一个实际约束，别随手改）：
#
# 1) 增量 = 「内容有变化才备份」。不是文件级增量、不建增量链。
#    每次先算当前数据指纹，与上次成功备份记录的指纹比对；相同则直接退出，不产新包。
#    这样日常运行成本接近零，也不会产生一堆内容重复的备份。
#
# 2) 滚动保留最多 3 个包。任意一个包都是自包含的完整快照，可独立还原。
#
# 3) 用 zstd 低压缩率档（--fast）。原因：uploads 里 718 个 png + 68 个 jpg 本身
#    已是压缩格式，实测 1.6G -> 1.6G 几乎零收益；再高的压缩档只是白烧 CPU。
#    保留 zst 的价值在于单文件封装 + 内建校验（zstd -t 可验完整性）。
#
# 4) 落在 /mnt/f（9p 文件系统）：跨盘硬链接不可用，故不能用 --link-dest 做快照，
#    一律用独立 tar 包。实测写入 1.6G 约 6 秒，可接受。
#
# 用法：
#   bash .claude/scripts/_backup_prod.sh            # 有变化才备份
#   bash .claude/scripts/_backup_prod.sh --force    # 强制备份（忽略指纹）
#   bash .claude/scripts/_backup_prod.sh --list     # 列出已有备份
#   bash .claude/scripts/_backup_prod.sh --status   # 显示上次指纹与是否该备份

set -euo pipefail

DOCROOT="/root/www/typecho_prod"
UPLOADS="$DOCROOT/usr/uploads"
ENV_FILE="/www/dk_project/dk_app/typecho/typecho_AGbF/.env"

BACKUP_ROOT="/mnt/f/1A开发备份/博客备份"
STATE_DIR="/root/.local/state/typecho-backup"
FP_FILE="$STATE_DIR/last_fingerprint"
KEEP_COUNT=3

# 数据库单包与整站单包分开，便于只恢复其中一样
DB_PREFIX="typecho_db"
UP_PREFIX="typecho_uploads"

ZSTD_LEVEL="--fast=3"

STAMP="$(date +%Y%m%d_%H%M%S)"

log() { echo "[backup] $*"; }

getval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }

db_container() {
    docker ps -a --format '{{.ID}} {{.Names}}' | awk '/mysql_wlzr/ {print $1; exit}'
}

# 计算数据指纹。
# 数据库：mysqldump 内容本身做哈希代价太高，改用「每表校验和 + 行数」聚合，
#         足以捕获内容变化，且开销小。
# uploads：用「路径 + 大小 + mtime」列表哈希。mtime 变化即视为变化（如覆盖上传）。
fingerprint() {
    local db_id db_user db_pass db_name
    db_id="$(db_container)"
    if [[ -z "$db_id" ]]; then
        log "找不到数据库容器，无法计算指纹"; return 1
    fi
    db_user="$(getval MYSQL_USER)"; db_pass="$(getval MYSQL_PASSWORD)"; db_name="$(getval MYSQL_DATABASE)"

    local db_fp up_fp
    db_fp="$(docker exec -e MYSQL_PWD="$db_pass" "$db_id" \
        mysql -u"$db_user" -h127.0.0.1 -P3306 -N -B "$db_name" \
        -e "CHECKSUM TABLE $(docker exec -e MYSQL_PWD="$db_pass" "$db_id" \
            mysql -u"$db_user" -h127.0.0.1 -P3306 -N -B "$db_name" \
            -e 'SHOW TABLES' | tr '\n' ',' | sed 's/,$//')" \
        2>/dev/null | sha256sum | cut -d' ' -f1)"

    up_fp="$(cd "$UPLOADS" && find . -type f -printf '%p %s %T@\n' 2>/dev/null \
        | sort | sha256sum | cut -d' ' -f1)"

    echo "${db_fp}-${up_fp}"
}

current_fingerprint() { cat "$FP_FILE" 2>/dev/null || echo ""; }

do_backup() {
    local db_id db_user db_pass db_name out_db out_up
    mkdir -p "$BACKUP_ROOT" "$STATE_DIR"

    db_id="$(db_container)"
    [[ -n "$db_id" ]] || { log "找不到数据库容器"; return 1; }
    db_user="$(getval MYSQL_USER)"; db_pass="$(getval MYSQL_PASSWORD)"; db_name="$(getval MYSQL_DATABASE)"

    # --- 数据库包 ---
    out_db="$BACKUP_ROOT/${DB_PREFIX}_${STAMP}.sql.zst"
    log "导出数据库 -> $out_db"
    # --no-tablespaces：应用用户无 PROCESS 权限，不加会报 Access denied
    docker exec -e MYSQL_PWD="$db_pass" "$db_id" \
        mysqldump -u"$db_user" -h127.0.0.1 -P3306 --single-transaction \
        --skip-lock-tables --no-tablespaces --default-character-set=utf8mb4 "$db_name" \
        | zstd $ZSTD_LEVEL -T0 -q -o "$out_db"
    log "  数据库包 $(du -h "$out_db" | cut -f1)"

    # --- uploads 包 ---
    out_up="$BACKUP_ROOT/${UP_PREFIX}_${STAMP}.tar.zst"
    log "打包 uploads -> $out_up"
    tar -C "$UPLOADS" -cf - . 2>/dev/null | zstd $ZSTD_LEVEL -T0 -q -o "$out_up"
    log "  uploads 包 $(du -h "$out_up" | cut -f1)"

    # --- 校验 ---
    if zstd -t "$out_db" > /dev/null 2>&1 && zstd -t "$out_up" > /dev/null 2>&1; then
        log "完整性校验通过"
    else
        log "!! 校验失败，删除本次包"
        rm -f "$out_db" "$out_up"
        return 1
    fi
}

prune() {
    # 数据库包与 uploads 包分别按时间戳排序，各自保留最新 KEEP_COUNT 个。
    # 用 ls -1 排序（时间戳前缀天然可比），不依赖文件 mtime，避免 9p 上 mtime 不可靠。
    local f
    for prefix in "$DB_PREFIX" "$UP_PREFIX"; do
        local arr
        mapfile -t arr < <(ls -1 "$BACKUP_ROOT"/${prefix}_*.zst* 2>/dev/null | sort)
        local n="${#arr[@]}"
        if (( n > KEEP_COUNT )); then
            local del=$(( n - KEEP_COUNT ))
            for ((i=0; i<del; i++)); do
                rm -f "${arr[$i]}"
                log "清理旧包: $(basename "${arr[$i]}")"
            done
        fi
    done
}

list_backups() {
    log "备份目录: $BACKUP_ROOT"
    echo "--- 数据库包 ---"
    ls -lht "$BACKUP_ROOT"/${DB_PREFIX}_*.zst 2>/dev/null | awk '{print "  " $5 "\t" $6" "$7" "$8"\t" $9}' || echo "  （无）"
    echo "--- uploads 包 ---"
    ls -lht "$BACKUP_ROOT"/${UP_PREFIX}_*.tar.zst 2>/dev/null | awk '{print "  " $5 "\t" $6" "$7" "$8"\t" $9}' || echo "  （无）"
    echo "--- 总占用 ---"
    du -sh "$BACKUP_ROOT" 2>/dev/null || echo "  （无）"
}

case "${1:-run}" in
    run)
        mkdir -p "$STATE_DIR"
        cur="$(fingerprint)" || exit 1
        prev="$(current_fingerprint)"
        if [[ "$cur" == "$prev" ]]; then
            log "数据无变化（指纹 ${cur:0:16}…），跳过备份"
            exit 0
        fi
        log "检测到变化：${prev:0:16}… -> ${cur:0:16}…"
        do_backup
        echo "$cur" > "$FP_FILE"
        prune
        list_backups
        ;;
    --force)
        mkdir -p "$STATE_DIR"
        cur="$(fingerprint)" || exit 1
        log "强制备份，忽略指纹比对"
        do_backup
        echo "$cur" > "$FP_FILE"
        prune
        list_backups
        ;;
    --list)   list_backups ;;
    --status)
        cur="$(fingerprint)" || exit 1
        prev="$(current_fingerprint)"
        log "当前指纹: ${cur:0:16}…"
        log "上次指纹: ${prev:0:16}…"
        if [[ "$cur" == "$prev" ]]; then
            log "状态: 无变化，下次自动运行会跳过"
        else
            log "状态: 有变化，下次自动运行会执行备份"
        fi
        ;;
    *) echo "用法: $0 [run|--force|--list|--status]"; exit 1 ;;
esac