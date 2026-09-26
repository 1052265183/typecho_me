#!/usr/bin/env python3
"""摸底数据源：读本机 config.inc.php + 探 typecho 容器 uploads 路径 + 探 MySQL 连接"""
import subprocess, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=30):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

def wsl(cmd, timeout=60):
    return run(['wsl', 'bash', '-c', cmd], timeout=timeout)

# 1. 本机 config.inc.php
print('===== 本机 config.inc.php =====')
config = Path('E:/deepseek_work/typecho/config.inc.php')
if config.exists():
    print(config.read_text(encoding='utf-8'))
else:
    print('NOT EXIST')

# 2. typecho 容器内部结构 + uploads 路径
print()
print('===== typecho 容器内部 =====')
r = wsl('docker exec typecho_agbf-typecho_AGbF-1 ls -la /app 2>&1 | head -30 || echo NO_DOCKER_EXEC')
print(r.stdout)

print()
print('===== typecho 容器 uploads 路径 =====')
r = wsl('''
docker exec typecho_agbf-typecho_AGbF-1 sh -c "
echo '--- /app/usr ---'
ls -la /app/usr 2>/dev/null | head -20
echo '--- /app/usr/uploads ---'
ls -la /app/usr/uploads 2>/dev/null | head -10
echo '--- /var/www/html ---'
ls -la /var/www/html 2>/dev/null | head -20
echo '--- /var/www/html/usr/uploads ---'
ls -la /var/www/html/usr/uploads 2>/dev/null | head -10
echo '--- which typecho config ---'
find / -name 'config.inc.php' 2>/dev/null | head -5
" 2>&1
''')
print(r.stdout)

# 3. MySQL 连接信息（typecho 容器的环境变量）
print()
print('===== typecho 容器环境变量（找 MySQL 连接） =====')
r = wsl('docker inspect typecho_agbf-typecho_AGbF-1 --format "{{range .Config.Env}}{{println .}}{{end}}" 2>&1')
print(r.stdout)

# 4. MySQL 容器里的数据库列表
print()
print('===== MySQL 容器里有哪些库 =====')
r = wsl('docker exec mysql_wlzr-mysql_WLZR-1 sh -c "mysql -uroot -p\\"$MYSQL_ROOT_PASSWORD\\" -e \\"SHOW DATABASES;\\" 2>&1" 2>&1')
print(r.stdout)

# 5. typecho 容器的网络配置（看是否与 mysql_wlzr 同网络）
print()
print('===== typecho 容器网络 =====')
r = wsl('docker inspect typecho_agbf-typecho_AGbF-1 --format "{{range $k,$v := .NetworkSettings.Networks}}{{println $k}} {{end}}"')
print(r.stdout)