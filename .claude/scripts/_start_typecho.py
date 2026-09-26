#!/usr/bin/env python3
"""启动 Typecho：探测 XAMPP 路径 → 准备 config.inc.php → 启动 php -S 内置 server"""
import os
import sys
import time
import subprocess
import socket
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path('E:/deepseek_work/typecho').resolve()

def run(cmd, timeout=20, cwd=None):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout, cwd=cwd,
    )

# 1. 探测 XAMPP 路径
print('===== 探测 XAMPP 路径 =====')
candidates = [
    Path('C:/xampp'),
    Path('D:/xampp'),
    Path(os.environ.get('LOCALAPPDATA', '') + '/Programs/XAMPP') if os.environ.get('LOCALAPPDATA') else None,
]
candidates = [c for c in candidates if c]
found_xampp = None
for c in candidates:
    php_exe = c / 'php' / 'php.exe'
    print(f'  探测 {c}: {"OK" if php_exe.exists() else "NO"}')
    if php_exe.exists() and found_xampp is None:
        found_xampp = c

if found_xampp is None:
    print('未找到 XAMPP 安装目录')
    sys.exit(1)

php_exe = found_xampp / 'php' / 'php.exe'
print(f'\n使用 PHP: {php_exe}')

# 2. PHP 版本 + 模块
r = run([str(php_exe), '-v'])
print('PHP 版本:', r.stdout.splitlines()[0] if r.stdout else '')

r = run([str(php_exe), '-m'])
mods = [l.strip().lower() for l in r.stdout.splitlines()]
key_mods = ['pdo_sqlite', 'sqlite3', 'pdo_mysql', 'mysqli', 'json', 'mbstring', 'xml']
print('关键扩展:')
for k in key_mods:
    print(f'  [{"X" if k in mods else " "}] {k}')

if 'pdo_sqlite' not in mods:
    print('\n!!! pdo_sqlite 缺失，无法用 SQLite')
    sys.exit(1)

# 3. 找 php.ini 模板
php_ini = found_xampp / 'php' / 'php.ini'
if not php_ini.exists():
    php_ini_dev = found_xampp / 'php' / 'php.ini-development'
    php_ini_prod = found_xampp / 'php' / 'php.ini-production'
    if php_ini_dev.exists():
        print(f'\n未找到 php.ini，建议从 php.ini-development 复制')
    if php_ini_prod.exists():
        print(f'可复制: cp {php_ini_prod} {php_ini}')

# 4. 创建 usr/uploads/
uploads = ROOT / 'usr' / 'uploads'
uploads.mkdir(parents=True, exist_ok=True)
print(f'\n确保 {uploads} 存在: OK')

# 5. SQLite 数据库文件路径
db_file = ROOT / 'usr' / 'typecho.db'
print(f'SQLite 数据库: {db_file}')

# 6. 生成 config.inc.php（待 install.php 流程走完后会用，但我们先准备模板）
# install.php 会引导用户生成 config.inc.php，所以这里只放最小必要内容
config_php = ROOT / 'config.inc.php'
if config_php.exists():
    print(f'\nconfig.inc.php 已存在，跳过生成')
else:
    # 临时占位，等 install.php 完成后再正式生成
    # 但 install.php 第 1 页只是欢迎页，第 2 页才开始要 config 信息
    print(f'\nconfig.inc.php 不存在；将由 install.php 第 2 步引导生成')

# 7. 检查端口
def port_free(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('0.0.0.0', port))
        s.close()
        return True
    except OSError:
        s.close()
        return False

for port in [8000, 8080]:
    free = port_free(port)
    print(f'  端口 {port}: {"FREE" if free else "BUSY"}')

# 8. 输出启动指令（仅展示，不执行）
print('\n' + '=' * 50)
print('准备就绪。启动命令（供 review，不要自动跑）:')
print('=' * 50)
start_cmd = f'"{php_exe}" -S 0.0.0.0:8000 -t "{ROOT}"'
print(start_cmd)
print()
print('浏览器访问: http://localhost:8000/install.php')
print('注意：-t 指定文档根目录为项目根，这样路由才能正确解析')

# 9. 把 PHP 路径写到环境变量以便后续 shell 用
print(f'\n提示：PHP 已装好在 {php_exe}')
print(f'后续可以用 "{php_exe}" 直接调，或把 {found_xampp / "php"} 加到 PATH')