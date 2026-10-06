#!/usr/bin/env bash
# 发布：把开发环境的代码同步到本机正式环境。
#
# 这条命令替代了原先「宝塔面板 Bash + base64 分块传输」那套流程——
# 两套环境都在同一台机器的 WSL 里，发布退化成一次 rsync。
#
# 硬约束（动之前先读）：
#   1. usr/uploads/ 绝不参与同步——那是正式环境的用户数据（832 个文件 / 1.6G），
#      一旦被 --delete 扫到就永久丢失；
#   2. config.inc.php 绝不参与同步——两套环境的库名、账号、DEBUG 开关各自独立；
#   3. 默认只做 dry-run，实跑必须显式加 --apply，避免手滑。
#
# 用法：
#   bash .claude/scripts/_deploy_prod.sh            # 预演，打印将要发生的变更
#   bash .claude/scripts/_deploy_prod.sh --apply    # 实际执行
#   bash .claude/scripts/_deploy_prod.sh --apply --no-delete   # 保留正式环境多余文件

set -euo pipefail

SRC="/mnt/e/deepseek_work/typecho"
DST="/root/www/typecho_prod"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APPLY=0
DELETE=1
for arg in "$@"; do
    case "$arg" in
        --apply)      APPLY=1 ;;
        --no-delete)  DELETE=0 ;;
        -h|--help)    sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "未知参数: $arg"; exit 1 ;;
    esac
done

[[ -d "$SRC" ]] || { echo "开发目录不存在: $SRC"; exit 1; }
[[ -f "$DST/index.php" ]] || { echo "正式环境未初始化: $DST"; exit 1; }

# 用户数据与运行环境：永不同步
EXCLUDES=(
    --exclude='.git/'
    --exclude='.claude/'
    --exclude='usr/uploads/'
    --exclude='config.inc.php'
    --exclude='*.log'
    --exclude='logs/'
    # router.php 是 php -S 的路由脚本，源在 .claude/scripts/ 不在同步路径内；
    # 不排除的话 --delete 会把它扫掉，随后脚本末尾再补回来——白折腾一轮
    --exclude='router.php'
)

# router.php 是 php -S 的路由脚本，随 .claude 放不进同步范围，单独处理
ROUTER_SRC="$SCRIPT_DIR/router.php"

RSYNC_ARGS=(-a --itemize-changes)
[[ "$DELETE" -eq 1 ]] && RSYNC_ARGS+=(--delete)

if [[ "$APPLY" -eq 0 ]]; then
    echo "=== 预演模式（加 --apply 才会真正执行）==="
    rsync "${RSYNC_ARGS[@]}" "${EXCLUDES[@]}" --dry-run "$SRC/" "$DST/"
    echo
    echo "--- 另需单独同步的运行期文件 ---"
    [[ -f "$ROUTER_SRC" ]] && echo "router.php → $DST/router.php"
    exit 0
fi

echo "=== 实际同步 ==="
rsync "${RSYNC_ARGS[@]}" "${EXCLUDES[@]}" "$SRC/" "$DST/"

if [[ -f "$ROUTER_SRC" ]]; then
    cp "$ROUTER_SRC" "$DST/router.php"
    echo "已更新 router.php"
fi

# 语法体检：php -l 只查 PHP 层，模板/HTML 层问题仍需浏览器实测
echo
echo "=== 语法检查 ==="
FAILED=0
while IFS= read -r phpfile; do
    if ! php -l "$phpfile" > /dev/null 2>&1; then
        echo "语法错误: $phpfile"
        php -l "$phpfile" || true
        FAILED=1
    fi
done < <(find "$DST/var" "$DST/admin" "$DST/usr" "$DST/index.php" "$DST/install.php" \
             -name '*.php' -not -path '*/uploads/*' 2>/dev/null)
[[ "$FAILED" -eq 0 ]] && echo "全部通过"

echo
echo "=== 发布完成 ==="
echo "php -S 每次请求都会重新解析文件，无需重启服务。"
echo "浏览器验证： http://localhost:8001/ （注意静态资源仍按 siteUrl 指向穿透域名）"
echo "服务控制：   bash .claude/scripts/_prod_ctl.sh {status|restart|log}"