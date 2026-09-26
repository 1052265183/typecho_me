#!/usr/bin/env python3
"""探测本机 PHP / 数据库 / Web server 可用性"""
import os
import subprocess

ROOT = r'E:/deepseek_work/typecho'

def run(cmd, timeout=20):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

# 1. PHP
print('===== PHP 可用性 =====')
r = run(['where', 'php'])
print('where php:', r.stdout.strip() or 'NOT FOUND')
if r.returncode == 0:
    r = run(['php', '-v'])
    print('php -v:', r.stdout.splitlines()[0] if r.stdout else '')
    r = run(['php', '-m'])
    print('PHP modules (关键):')
    for line in r.stdout.splitlines():
        l = line.strip().lower()
        if any(k in l for k in ['pdo', 'sqlite', 'mysql', 'pgsql', 'json', 'mbstring', 'xml']):
            print('  -', line.strip())
    r = run(['php', '-S', '--help'])
    print('php -S 可用:', 'YES' if r.returncode == 0 else 'NO')

# 2. 数据库
print()
print('===== 数据库可用性 =====')
for cmd in [['where', 'mysql'], ['where', 'mariadb'], ['where', 'psql'], ['where', 'sqlite3']]:
    r = run(cmd)
    label = ' '.join(cmd[1:])
    print('  ' + label + ':', r.stdout.strip() or 'NOT FOUND')

# 3. Web server
print()
print('===== Web server 可用性 =====')
for cmd in [['where', 'nginx'], ['where', 'httpd'], ['where', 'apache']]:
    r = run(cmd)
    label = ' '.join(cmd[1:])
    print('  ' + label + ':', r.stdout.strip() or 'NOT FOUND')

# 4. 现有 config
print()
print('===== 项目现状 =====')
config = os.path.join(ROOT, 'config.inc.php')
print('config.inc.php 存在:', os.path.exists(config))
usr_uploads = os.path.join(ROOT, 'usr', 'uploads')
print('usr/uploads 存在:', os.path.exists(usr_uploads))

# 5. 安装文件存在性
install = os.path.join(ROOT, 'install.php')
print('install.php 存在:', os.path.exists(install))