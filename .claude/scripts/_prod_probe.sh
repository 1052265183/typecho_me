#!/usr/bin/env bash
# 正式环境（宝塔 Docker）配置与数据规模探查。
#
# 两个坑写在前面：
#   1) 按容器名 docker exec 会报 "No such container"（名称大小写/解析不稳），一律用 filter 取 ID；
#   2) Windows 侧 PowerShell 传参会吃掉 --format 的引号，所以整段逻辑放在脚本里跑。
#
# 凭据从正式环境 .env 读取，只进环境变量不打印。
set -euo pipefail

ENV_FILE="/www/dk_project/dk_app/typecho/typecho_AGbF/.env"
DB_FILTER="name=mysql_WLzr"

getval() {
    grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'
}

# 不用 docker 的 --filter name=：它区分大小写，而容器名实为
# mysql_wlzr-mysql_WLZr-1（项目段小写 wlzr），按大写 filter 会匹配不到。
# 也不能用 head -1：提前关闭管道会让 docker 收到 SIGPIPE，pipefail 下结果为空。
DB_ID="$(docker ps -a --format '{{.ID}} {{.Names}}' | awk '/mysql_wlzr/ {print $1; exit}')"
if [[ -z "$DB_ID" ]]; then
    echo "找不到数据库容器（filter: $DB_FILTER）"; exit 1
fi

DB_USER="$(getval MYSQL_USER)"
DB_PASS="$(getval MYSQL_PASSWORD)"
DB_NAME="$(getval MYSQL_DATABASE)"
echo "数据库容器 ID=$DB_ID  库名=$DB_NAME"

run_sql() {
    docker exec -e MYSQL_PWD="$DB_PASS" "$DB_ID" \
        mysql --default-character-set=utf8mb4 --table \
        -u"$DB_USER" -h127.0.0.1 -P3306 "$DB_NAME" -e "$1" 2>&1
}

echo; echo "=== 永久链接 / 路由设置 ==="
run_sql "SELECT name, value FROM typecho_options
         WHERE name IN ('permalink','rewrite','frontPage','defaultRouterTable','category','commentsPage')"

echo; echo "=== 内容规模 ==="
run_sql "SELECT type, COUNT(*) AS cnt FROM typecho_contents GROUP BY type"

echo; echo "=== 评论 / 用户 ==="
run_sql "SELECT (SELECT COUNT(*) FROM typecho_comments) AS comments,
                (SELECT COUNT(*) FROM typecho_users) AS users,
                (SELECT COUNT(*) FROM typecho_options) AS options_rows"

echo; echo "=== 表引擎与体积 ==="
run_sql "SELECT table_name, engine,
                ROUND((data_length+index_length)/1024/1024,2) AS mb,
                table_rows
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND data_length > 0
         ORDER BY (data_length+index_length) DESC LIMIT 8"

echo; echo "=== .env 中的非密钥参数 ==="
grep -E '^(WEB_HTTP_PORT|HOST_IP|MYSQL_HOST_IP|MYSQL_PORT|TYPECHO_EXTERNAL_URL|TYPECHO_DB_ADAPTER|VERSION|APP_PATH)=' "$ENV_FILE" || true