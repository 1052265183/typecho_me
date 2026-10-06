#!/usr/bin/env bash
# 正式环境发布：git pull。
#
# 取代原先的 rsync 同步（_deploy_prod.sh）——用 git 后发布动作有了明确版本，
# 可回滚到任意提交，出问题能一眼看出是哪次发布引入的。
#
# 拓扑：
#   开发目录 E:\deepseek_work\typecho        （Windows，编辑 + commit + push）
#     └─ push → bare  E:/deepseek_work/typecho-bare.git
#          └─ pull → /root/www/typecho_prod  （WSL ext4，正式运行）
#
# 两处绝不参与 git 的路径（.gitignore 已排除，reset --hard 不会创建也不会删除）：
#   usr/uploads/   1.6G 用户上传数据
#   config.inc.php 正式环境独立配置（库指向 127.0.0.1:13306）
# 但仍做一次存在性校验——这是唯一能让正式环境直接崩掉的单文件。
#
# 用法：
#   bash .claude/scripts/_git_pull_prod.sh          # 预演：显示将要变动的提交
#   bash .claude/scripts/_git_pull_prod.sh --apply  # 实际发布

set -euo pipefail

DOCROOT="/root/www/typecho_prod"
REMOTE_PATH="/mnt/e/deepseek_work/typecho-bare.git"
REMOTE_NAME="bare"
BRANCH="master"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

[[ -d "$DOCROOT" ]] || { echo "正式环境不存在: $DOCROOT"; exit 1; }
cd "$DOCROOT"

# ext4 与 Windows 文件系统的权限位模型不同；不关掉的话每次 pull 都会刷出一堆 mode 变更
git config core.fileMode false 2>/dev/null || true

# dubious ownership 兜底：正式环境目录源自宝塔容器，rsync 保留了混合属主
# （www-data / www / huxu / root），以 root 跑 git 会被判为"所有者不可信"而拒绝一切命令。
# 根治手段是统一 chown，但仓库可能被再次以其他属主 rsync 进来，所以这里加一条豁免。
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$DOCROOT" \
    || git config --global --add safe.directory "$DOCROOT"

[[ -d .git ]] || git init -q
if ! git remote get-url "$REMOTE_NAME" > /dev/null 2>&1; then
    git remote add "$REMOTE_NAME" "$REMOTE_PATH"
fi

CURRENT="$(git rev-parse --short HEAD 2>/dev/null || echo '无（尚未接入 git）')"

if [[ "$APPLY" -eq 0 ]]; then
    git fetch -q "$REMOTE_NAME" "$BRANCH"
    TARGET="$(git rev-parse --short "$REMOTE_NAME/$BRANCH")"
    echo "=== 预演模式（加 --apply 才实际执行）==="
    echo "当前版本: $CURRENT"
    echo "目标版本: $TARGET"
    echo
    if [[ "$CURRENT" == "$TARGET" ]]; then
        echo "已是最新，无需发布。"
    else
        # 首次接入 git 时 CURRENT 只是占位串，不是合法 ref，直接对它跑 git log 会失败
        if git cat-file -e "$CURRENT^{commit}" 2>/dev/null; then
            echo "--- 待发布提交 ---"
            git log --oneline "$CURRENT..$REMOTE_NAME/$BRANCH" 2>/dev/null | head -20
            echo
            echo "--- 待变更文件 ---"
            git diff --stat "$CURRENT" "$REMOTE_NAME/$BRANCH" 2>/dev/null | tail -20
        else
            echo "首次接入 git，将检出完整历史。"
            git log --oneline "$REMOTE_NAME/$BRANCH" 2>/dev/null | head -10
        fi
    fi
    exit 0
fi

# 发布前对关键文件做存在性基线，发布后逐一复核
PROTECTED=("config.inc.php" "usr/uploads" "router.php")

echo "=== 实际发布 ==="
git fetch "$REMOTE_NAME" "$BRANCH"
git reset --hard "$REMOTE_NAME/$BRANCH"

echo
echo "=== 受保护路径复核 ==="
FAILED=0
for path in "${PROTECTED[@]}"; do
    if [[ -e "$path" ]]; then
        echo "OK   $path"
    else
        echo "缺失 $path  ← 需立即人工恢复"
        FAILED=1
    fi
done
[[ "$FAILED" -eq 0 ]] || { echo "受保护路径异常，发布判定失败"; exit 1; }

echo
echo "=== 语法检查 ==="
LINT_FAILED=0
while IFS= read -r f; do
    php -l "$f" > /dev/null 2>&1 || { echo "语法错误: $f"; LINT_FAILED=1; }
done < <(find "$DOCROOT/var" "$DOCROOT/admin" "$DOCROOT/index.php" -name '*.php' 2>/dev/null)
[[ "$LINT_FAILED" -eq 0 ]] && echo "通过"

echo
echo "=== 发布完成 ==="
echo "版本: $(git log --oneline -1)"
echo "正式环境工作区未提交项: $(git status --porcelain | wc -l)（正常应为 0）"
echo "验证: curl -s -o /dev/null -w '%{http_code}' http://localhost:8001/"
echo "回滚: git reset --hard <上一提交号>  （需重新 push 到 bare 后再在正式环境 reset）"