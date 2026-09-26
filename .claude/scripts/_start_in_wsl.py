#!/usr/bin/env python3
"""在 WSL 里启动 Typecho：
1. 探测 sudo 免密码情况
2. 装 php8.2-sqlite3 扩展（按需）
3. 创建 usr/uploads
4. 验证 PHP 模块
5. 启动 php -S 内置 server"""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=60):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

def wsl(cmd_str, timeout=60):
    """在 WSL 默认发行版里跑 bash 命令"""
    return run(['wsl', 'bash', '-c', cmd_str], timeout=timeout)

ROOT_WSL = '/mnt/e/deepseek_work/typecho'

# bash 探测脚本（用 __ROOT__ 占位 + str.replace 注入，避开 f-string 与 bash $2 冲突）
PROBE_BASH = """
echo '--- PHP version ---'
php -v 2>&1 | head -1
echo '--- PHP key modules ---'
php -m 2>/dev/null | grep -iE '^(pdo_sqlite|sqlite3|pdo_mysql|mysqli|pgsql|pdo_pgsql|json|mbstring|xml)$' | sort -u || echo 'none'
echo '--- existing config ---'
ls -l __ROOT__/config.inc.php 2>/dev/null || echo 'no config.inc.php'
echo '--- usr/uploads ---'
ls -ld __ROOT__/usr/uploads 2>/dev/null || echo 'no usr/uploads'
echo '--- which apt-get ---'
which apt-get
echo '--- dpkg list php8.2 ---'
dpkg -l 'php8.2*' 2>/dev/null | grep '^ii' | awk '{print $2}' | head -10 || echo 'no php8.2 packages'
""".replace('__ROOT__', ROOT_WSL)

# 1. sudo 探测
print('===== 探测 sudo =====')
# 用 sudo -n 测试免密码（-n 避免交互）
r = wsl('sudo -n true && echo SUDO_OK || echo SUDO_NEED_PWD')
print(r.stdout.strip())
print(r.stderr.strip())

# 2. 现状
print()
print('===== WSL 现状 =====')
r = wsl(PROBE_BASH)
print(r.stdout)
if r.stderr:
    print('stderr:', r.stderr)

# 3. 如果缺 pdo_sqlite，装包
print()
print('===== 装 php8.2-sqlite3 =====')
if 'SUDO_OK' in r.stdout and 'pdo_sqlite' not in r.stdout:
    print('sudo 免密码 + 缺 pdo_sqlite → 开始装包')
    r = wsl('sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y php8.2-sqlite3 2>&1 | tail -20')
    print(r.stdout)
    if r.stderr:
        print('stderr:', r.stderr)
elif 'pdo_sqlite' in r.stdout:
    print('pdo_sqlite 已存在，跳过装包')
elif 'SUDO_NEED_PWD' in r.stdout:
    print('sudo 需要密码，需要用户手动执行')

# 4. 验证装好后模块
print()
print('===== 验证 pdo_sqlite =====')
r = wsl('php -m 2>/dev/null | grep -iE "^(pdo_sqlite|sqlite3)$"')
print('模块:', r.stdout.strip() if r.stdout else 'NOT FOUND')

# 5. 创建 usr/uploads
print()
print('===== 创建 usr/uploads =====')
r = wsl(f'mkdir -p {ROOT_WSL}/usr/uploads && ls -ld {ROOT_WSL}/usr/uploads')
print(r.stdout.strip())

# 6. 端口探测
print()
print('===== 探测端口 =====')
r = wsl('''
for p in 8000 8080; do
  if ss -ltn 2>/dev/null | grep -q ":$p "; then echo "PORT $p BUSY"
  elif netstat -ltn 2>/dev/null | grep -q ":$p "; then echo "PORT $p BUSY"
  else echo "PORT $p FREE"; fi
done
''')
print(r.stdout.strip())

print()
print('===== 准备就绪 =====')
print('下一步启动命令（在 WSL 里跑）：')
print(f'  cd {ROOT_WSL} && php -S 0.0.0.0:8000')
print('浏览器访问：')
print('  http://localhost:8000/install.php  （Windows 主机访问）')
print('  http://127.0.0.1:8000/install.php  （WSL 内访问）')