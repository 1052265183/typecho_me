#!/usr/bin/env python3
"""本地 Typecho MySQL 只读查询封装（WSL Docker 容器内）。

背景：PowerShell 直接转发 `wsl ... docker exec ... --default-character-set=utf8mb4`
时会把 `=` 与 `.` 参数拆坏（host 被截成 127），故用 Python 的 subprocess 列表传参绕开。

用法：
    python .claude/scripts/_mysql_query.py "SELECT cid, title FROM typecho_contents LIMIT 5"

凭据从环境变量读（与 CLAUDE.md §6「不硬编码密钥」一致）：
    TYPECHO_DB_USER   必填
    TYPECHO_DB_PASS   必填
    TYPECHO_DB_NAME   默认 jbxfamr4fjr4ahaz
    TYPECHO_DB_CONTAINER 默认 mysql_test-mysql_test-1

只读护栏：仅放行 SELECT / SHOW / DESCRIBE / EXPLAIN / WITH，写语句一律拒绝。
容器与端口等环境信息见 CLAUDE.md §0.5，凭据值见 typecho-DEVELOPER_RULES.md「环境变量」段。
"""
import os
import subprocess
import sys

CONTAINER = os.environ.get("TYPECHO_DB_CONTAINER", "mysql_test-mysql_test-1")
DB = os.environ.get("TYPECHO_DB_NAME", "jbxfamr4fjr4ahaz")
# 容器内固定用回环 + 3306：宿主机映射端口（如 13307）只在 Windows 侧直连时有效，
# 从容器内部连 127.0.0.1:13307 会连接被拒
HOST = "127.0.0.1"
PORT = "3306"
USER = os.environ.get("TYPECHO_DB_USER", "")
PASSWORD = os.environ.get("TYPECHO_DB_PASS", "")
READONLY_HEADS = ("select", "show", "describe", "desc", "explain", "with")


def main():
    if len(sys.argv) < 2:
        sys.exit('用法：python .claude/scripts/_mysql_query.py "SELECT ..."')

    sql = " ".join(sys.argv[1:]).strip().rstrip(";")
    head = sql.split(None, 1)[0].lower()
    if head not in READONLY_HEADS:
        sys.exit("只读护栏：仅允许 %s，收到 %s" % ("|".join(READONLY_HEADS), head))
    if not USER or not PASSWORD:
        sys.exit("缺少凭据：请先设置 TYPECHO_DB_USER 与 TYPECHO_DB_PASS 环境变量")

    cmd = [
        "wsl", "-d", "Android", "--", "docker", "exec",
        "-e", "MYSQL_PWD=" + PASSWORD, CONTAINER,
        "mysql", "--default-character-set=utf8mb4",
        "-u" + USER, "-h" + HOST, "-P" + PORT, DB,
        "-e", sql,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
