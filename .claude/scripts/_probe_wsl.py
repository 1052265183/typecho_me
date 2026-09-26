#!/usr/bin/env python3
"""探测 WSL 环境 + WSL 内 PHP/数据库/Web server 可用性"""
import os
import subprocess
import sys

# 强制 UTF-8 输出
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=30):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

# 1. wsl --status
print('===== wsl --status =====')
r = run(['wsl', '--status'])
print(r.stdout if r.stdout else '(empty)')
if r.stderr:
    print('stderr:', r.stderr)

# 2. wsl -l -v
print()
print('===== wsl -l -v =====')
r = run(['wsl', '-l', '-v'])
print(r.stdout if r.stdout else '(empty)')
if r.stderr:
    print('stderr:', r.stderr)

# 3. 默认发行版
print()
print('===== wsl -l (no -v) =====')
r = run(['wsl', '-l'])
print(r.stdout if r.stdout else '(empty)')

# 4. 默认发行版短名（用于后续 -d）
print()
print('===== 探测 WSL 内 PHP/DB/Web =====')
# 用 bash -c 探测
probe = r'''
echo '--- /etc/os-release ---'
cat /etc/os-release 2>/dev/null | head -5
echo '--- php ---'
which php && php -v 2>&1 | head -3 || echo "PHP NOT FOUND"
echo '--- php modules (key) ---'
php -m 2>/dev/null | grep -iE '^(pdo|sqlite|mysql|pgsql|json|mbstring|xml)$' || echo "no key modules"
echo '--- databases ---'
for c in mysql mariadb psql sqlite3; do
  P=$(which $c 2>/dev/null)
  if [ -n "$P" ]; then echo "$c: $P"; else echo "$c: NOT FOUND"; fi
done
echo '--- web servers ---'
for c in nginx apache2 httpd; do
  P=$(which $c 2>/dev/null)
  if [ -n "$P" ]; then echo "$c: $P"; else echo "$c: NOT FOUND"; fi
done
echo '--- Windows mount: /mnt/e ---'
ls -d /mnt/e 2>/dev/null && echo "OK /mnt/e exists" || echo "NO /mnt/e"
echo '--- project on /mnt/e ---'
ls -ld /mnt/e/deepseek_work/typecho 2>/dev/null && echo "OK project visible" || echo "NO project"
echo '--- existing config ---'
ls -l /mnt/e/deepseek_work/typecho/config.inc.php 2>/dev/null || echo "no config.inc.php"
echo '--- usr/uploads ---'
ls -ld /mnt/e/deepseek_work/typecho/usr/uploads 2>/dev/null || echo "no usr/uploads"
'''
r = run(['wsl', 'bash', '-c', probe], timeout=60)
print(r.stdout if r.stdout else '(empty)')
if r.stderr:
    print('stderr:', r.stderr)