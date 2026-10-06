#!/usr/bin/env python3
"""生成新正式环境的 config.inc.php。

背景：源环境跑在 compose 网络内，DB 主机写的是服务名 `mysql_Ni7e`。
新环境用 `php -S` 直接跑在 WSL 宿主上，不在 compose 网络里，
必须把 host 换成回环地址、端口换成宿主映射端口（mysql_WLZr → 13306）。

账号 / 密码 / 库名沿用源配置——数据库容器没变，凭据不该在脚本里出现。

脱敏口径（上一版正则漏了 `'password' => '...'` 这种带空格的写法，
导致凭据明文出现在会话记录里，本版按实际格式重新覆盖）：
    password / sslCa / user 的值一律打码后才允许输出。
"""
import re
import sys
from pathlib import Path

SRC = Path("/www/dk_project/dk_app/typecho/typecho_AGbF/data/config.inc.php")
DST = Path("/root/www/typecho_prod/config.inc.php")

NEW_HOST = "127.0.0.1"
NEW_PORT = "13306"

# 输出前统一打码，键名不区分大小写
SECRET_KEYS = ("password", "sslca", "user")


def mask(text: str) -> str:
    """把敏感键的值替换成 <masked>，用于任何输出。"""
    pattern = re.compile(
        r"('(?:%s)'\s*=>\s*)'[^']*'" % "|".join(SECRET_KEYS),
        re.IGNORECASE,
    )
    return pattern.sub(r"\1'<masked>'", text)


def main() -> int:
    if not SRC.exists():
        print("源配置不存在：", SRC)
        return 1

    text = SRC.read_text(encoding="utf-8")

    before = text
    text = re.sub(r"('host'\s*=>\s*)'[^']*'", r"\1'" + NEW_HOST + "'", text)
    text = re.sub(r"('port'\s*=>\s*)\d+", r"\g<1>" + NEW_PORT, text)
    # 生产环境不开调试：错误详情会直接回显给访客
    text = re.sub(
        r"(define\('__TYPECHO_DEBUG__',\s*)true",
        r"\1false",
        text,
    )

    if text == before:
        print("警告：三项替换都没命中，请检查源配置格式")

    DST.write_text(text, encoding="utf-8")

    print("已写入：", DST)
    print("--- 关键项核对（敏感值已打码）---")
    for line in text.splitlines():
        if re.search(r"'host'|'port'|'database'|'user'|'password'|DEBUG", line, re.IGNORECASE):
            print(mask(line.strip()))
    return 0


if __name__ == "__main__":
    sys.exit(main())