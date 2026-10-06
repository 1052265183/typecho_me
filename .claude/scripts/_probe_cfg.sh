#!/usr/bin/env bash
# 脱敏查看正式环境 config.inc.php 的结构，并确认 WSL 运行环境。
# 目的：新环境要复用同一个数据库容器，但 php -S 跑在 WSL 宿主上，
#       原配置里的 compose 服务名（mysql_Ni7e）在此不可解析，必须换成宿主映射端口。

set -euo pipefail

SRC_CFG="/www/dk_project/dk_app/typecho/typecho_AGbF/data/config.inc.php"

echo "=== WSL 运行环境 ==="
echo "whoami = $(whoami)"
echo "HOME   = ${HOME}"
echo "PWD    = $(pwd)"

echo
echo "=== 源 config.inc.php（密码脱敏）==="
if [[ -f "$SRC_CFG" ]]; then
    sed -E "s/(define\('__TYPECHO_DB_PASSWORD__',).*/\1 '<masked>');/; \
            s/(password['\"]?\s*[:=]\s*['\"])[^'\"]*/\1<masked>/g" "$SRC_CFG"
else
    echo "文件不存在: $SRC_CFG"
fi

echo
echo "=== 源 data 目录体积 ==="
du -sh /www/dk_project/dk_app/typecho/typecho_AGbF/data 2>/dev/null || true
du -sh /www/dk_project/dk_app/typecho/typecho_AGbF/data/usr/uploads 2>/dev/null || true

echo
echo "=== ext4 可用空间与家目录 ==="
df -h / | tail -1
ls -ld "${HOME}" 2>/dev/null || true