#!/usr/bin/env python3
"""探测 WSL 内 Docker 与可能的 Typecho 容器，作为数据源摸底"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=30):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

def wsl(cmd, timeout=60):
    return run(['wsl', 'bash', '-c', cmd], timeout=timeout)

# 1. WSL 内 docker 命令
print('===== WSL 内 docker 命令 =====')
r = wsl('which docker 2>&1; docker --version 2>&1 || echo DOCKER_NOT_FOUND')
print(r.stdout)
if r.stderr:
    print('stderr:', r.stderr[:200])

# 2. 当前是否有运行中的容器
print()
print('===== 容器列表 =====')
r = wsl('docker ps -a 2>&1 || echo NO_DOCKER')
print(r.stdout)

# 3. 镜像列表（看有没有 typecho 镜像）
print()
print('===== 镜像列表（grep typecho） =====')
r = wsl('docker images 2>&1 | grep -iE "typecho|mysql|mariadb|nginx" || echo no_match')
print(r.stdout)

# 4. Docker volume 列表
print()
print('===== volume 列表（grep typecho） =====')
r = wsl('docker volume ls 2>&1 | grep -iE "typecho|mysql|mariadb" || echo no_match')
print(r.stdout)

# 5. 当前本机 typecho 状态（目标）
print()
print('===== 当前本机 Typecho（目标）状态 =====')
r = run(['python', '-c', '''
import os
from pathlib import Path
ROOT = Path("E:/deepseek_work/typecho")
config = ROOT / "config.inc.php"
db = ROOT / "usr" / "typecho.db"
uploads = ROOT / "usr" / "uploads"
print(f"  config.inc.php: {"exists ({config.stat().st_size} bytes)" if config.exists() else "NOT EXIST"}")
print(f"  usr/typecho.db: {"exists ({db.stat().st_size} bytes)" if db.exists() else "NOT EXIST"}")
print(f"  usr/uploads/: {"exists" if uploads.exists() else "NOT EXIST"}")
'''])
print(r.stdout)