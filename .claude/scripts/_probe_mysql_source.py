#!/usr/bin/env python3
"""摸底源 MySQL：找正确容器名 + 探表结构 + 记录大小"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=30):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

def wsl(cmd, timeout=60):
    return run(['wsl', 'bash', '-c', cmd], timeout=timeout)

# 1. 列出所有容器（不区分大小写）
print('===== 所有容器（容器 ID + 镜像 + 名字 + 状态） =====')
r = wsl('docker ps -a --format "table {{.ID}}\\t{{.Image}}\\t{{.Names}}\\t{{.Status}}"')
print(r.stdout)

# 2. 通过环境变量反查 typecho 容器连的 MySQL
print()
print('===== typecho 容器实际连的 MySQL 主机 =====')
r = wsl('docker inspect typecho_agbf-typecho_AGbF-1 --format "{{range .Config.Env}}{{println .}}{{end}}" 2>&1 | grep TYPECHO_DB_')
print(r.stdout)

# 3. 找 mysql_Ni7e 这个容器（注意大小写）
print()
print('===== mysql_Ni7e 容器候选 =====')
r = wsl('docker ps -a --format "{{.Names}}" 2>&1 | grep -i ni7e')
print('grep ni7e:', r.stdout)

# 4. 探测源 MySQL：库列表 + 表列表 + 各表行数
# 容器名可能是 mysql_Ni7e-mysql_Ni7e-1，参考 typecho 容器的环境变量大小写
print()
print('===== 尝试进 mysql 容器（环境变量驱动） =====')
# 用 docker inspect 反查 mysql_Ni7e 服务的容器名
r = wsl('docker ps -a --filter "name=Ni7e" --format "{{.ID}} {{.Names}} {{.Image}} {{.Status}}"')
print(r.stdout)

# 5. 从 typecho 容器里直接连 MySQL 验证（避免外部网络）
print()
print('===== 从 typecho 容器里查 MySQL 表 =====')
r = wsl('''
docker exec typecho_agbf-typecho_AGbF-1 sh -c "
DB_HOST=mysql_Ni7e
DB_USER=cGnMYsk8eccP6iHr
DB_PASS=eLk5ycRJrYebL5XF
DB_NAME=Jbxfamr4fJr4AhAZ
echo '--- 库列表 ---'
mysql -h \$DB_HOST -u\$DB_USER -p\$DB_PASS -e 'SHOW DATABASES;' 2>&1
echo '--- 当前库的表列表 ---'
mysql -h \$DB_HOST -u\$DB_USER -p\$DB_PASS \$DB_NAME -e 'SHOW TABLES;' 2>&1
echo '--- 每张表的行数 ---'
for t in \$(mysql -h \$DB_HOST -u\$DB_USER -p\$DB_PASS -N -e \"SHOW TABLES\" \$DB_NAME 2>/dev/null); do
  cnt=\$(mysql -h \$DB_HOST -u\$DB_USER -p\$DB_PASS -N -e \"SELECT COUNT(*) FROM \$t\" \$DB_NAME 2>/dev/null)
  echo \"  \$t: \$cnt 行\"
done
" 2>&1
''')
print(r.stdout)