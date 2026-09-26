#!/usr/bin/env python3
"""确认 13306 端口占用来源：WSL 内部 netstat vs Windows netstat"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def wsl(cmd, timeout=30):
    return subprocess.run(
        ['wsl', 'bash', '-c', cmd],
        capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

def run(cmd, timeout=30):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

# 1. Windows 主机 netstat
print('===== Windows 主机 netstat（看 13306） =====')
r = run(['netstat', '-ano'])
for line in r.stdout.splitlines():
    if '13306' in line:
        print('  ', line)

# 2. WSL 内 netstat（如果 docker 在 WSL 内跑，应该看到 mysql_wlzr 容器绑的端口）
print()
print('===== WSL 内 netstat（看 13306） =====')
r = wsl('netstat -tlnp 2>/dev/null | grep 13306 || ss -tlnp 2>/dev/null | grep 13306')
print(r.stdout if r.stdout else '  no listener')

# 3. 列出所有占 13306 端口的容器
print()
print('===== Docker 内 13306 端口占用 =====')
r = wsl('docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Ports}}" | grep -E "13306|NAMES"')
print(r.stdout)