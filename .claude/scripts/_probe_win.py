#!/usr/bin/env python3
"""探测 Windows 主机 PHP/数据库/Web server 可用性"""
import os
import subprocess
import sys

# 强制 UTF-8 输出，避免 GBK 渲染问题
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = r'E:/deepseek_work/typecho'

def run(cmd, timeout=20):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout, shell=False,
    )

def where(name):
    r = run(['where', name])
    return r.stdout.strip().splitlines()[0] if r.returncode == 0 and r.stdout.strip() else None

# 1. PHP
print('===== PHP =====')
php = where('php')
print('where php:', php or 'NOT FOUND')
if php:
    r = run(['php', '-v'])
    print('php -v (line 1):', r.stdout.splitlines()[0] if r.stdout else '')
    # 关键模块
    r = run(['php', '-m'])
    key_mods = ['pdo_sqlite', 'sqlite3', 'pdo_mysql', 'mysqli', 'pgsql', 'pdo_pgsql',
                'json', 'mbstring', 'xml', 'curl']
    found = []
    for line in r.stdout.splitlines():
        l = line.strip().lower()
        for k in key_mods:
            if l == k:
                found.append(k)
    print('PHP 关键模块命中:')
    for k in key_mods:
        print('  ', '[X]' if k in found else '[ ]', k)

# 2. 数据库
print()
print('===== 数据库 =====')
for c in ['mysql', 'mysqld', 'mariadb', 'psql', 'postgres', 'sqlite3']:
    p = where(c)
    print('  ', c + ':', p or 'NOT FOUND')

# 3. Web server
print()
print('===== Web server =====')
for c in ['nginx', 'httpd', 'apache', 'apache2']:
    p = where(c)
    print('  ', c + ':', p or 'NOT FOUND')

# 4. 项目现状
print()
print('===== 项目现状 =====')
print('config.inc.php 存在:', os.path.exists(os.path.join(ROOT, 'config.inc.php')))
print('usr/uploads 存在:', os.path.exists(os.path.join(ROOT, 'usr', 'uploads')))
print('install.php 存在:', os.path.exists(os.path.join(ROOT, 'install.php')))

# 5. 服务管理
print()
print('===== 服务 / 端口 =====')
r = run(['netstat', '-ano'])
listening = [l for l in r.stdout.splitlines() if 'LISTENING' in l and '127.0.0.1' in l]
print(f'当前 LISTENING 端口（127.0.0.1）：{len(listening)} 个')
# 看看 80/8000/8080/3306/5432 是否被占
for port in ['80', '443', '3306', '5432', '8000', '8080']:
    hits = [l for l in listening if f':{port} ' in l]
    if hits:
        print(f'  端口 {port}: 已占用 ({len(hits)} 个)')
    else:
        print(f'  端口 {port}: 未占用')

# 6. 关键进程
print()
print('===== 关键进程扫描 =====')
r = run(['tasklist', '/FO', 'CSV'])
procs = r.stdout.splitlines()
keys = ['php', 'mysql', 'mariadb', 'nginx', 'postgres', 'apache']
for k in keys:
    hits = [p for p in procs if k in p.lower()]
    if hits:
        print(f'  {k}: 运行中 ({len(hits)} 个进程)')
    else:
        print(f'  {k}: 未运行')