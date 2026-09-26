#!/usr/bin/env python3
"""启动 mysql_ni7e 容器 + 探表 + mysqldump"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def wsl(cmd, timeout=60):
    return subprocess.run(
        ['wsl', 'bash', '-c', cmd],
        capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

C = 'mysql_ni7e-mysql_Ni7e-1'

# 1. 启动容器
print('===== 启动 mysql_ni7e 容器 =====')
r = wsl(f'docker start {C} 2>&1')
print(r.stdout)

# 2. 等几秒让 MySQL ready
import time
time.sleep(3)

# 3. 进 mysql 容器探库
print()
print('===== 库列表 + 表列表 + 行数 =====')
r = wsl(f'''
docker exec {C} sh -c "
DB_USER=cGnMYsk8eccP6iHr
DB_PASS=eLk5ycRJrYebL5XF
DB_NAME=Jbxfamr4fJr4AhAZ
echo '--- 库列表 ---'
mysql -u\\$DB_USER -p\\$DB_PASS -e 'SHOW DATABASES;' 2>&1
echo '--- 表列表 ---'
mysql -u\\$DB_USER -p\\$DB_PASS \\$DB_NAME -e 'SHOW TABLES;' 2>&1
echo '--- 每张表行数 ---'
mysql -u\\$DB_USER -p\\$DB_PASS -N -e \\"SELECT CONCAT(TABLE_NAME, ':', TABLE_ROWS) FROM information_schema.TABLES WHERE TABLE_SCHEMA='\\$DB_NAME'\\" 2>&1
" 2>&1
''')
print(r.stdout)
if r.stderr:
    print('stderr:', r.stderr[:500])

# 4. 表 schema dump
print()
print('===== 表 schema（部分） =====')
r = wsl(f'''
docker exec {C} sh -c "
mysql -ucGnMYsk8eccP6iHr -peLk5ycRJrYebL5XF Jbxfamr4fJr4AhAZ -e 'SHOW CREATE TABLE typecho_contents\\G' 2>&1 | head -30
echo '---'
mysql -ucGnMYsk8eccP6iHr -peLk5ycRJrYebL5XF Jbxfamr4fJr4AhAZ -e 'SHOW CREATE TABLE typecho_options\\G' 2>&1 | head -30
" 2>&1
''')
print(r.stdout)