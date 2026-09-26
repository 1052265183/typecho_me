#!/usr/bin/env python3
"""快速验证 PHP server 还活着"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. WSL 内 curl（bash '||' 在 pwsh -Command 里被误解析，全部走 Python subprocess）
r = subprocess.run(
    ['wsl', 'bash', '-c', "curl -s -o /dev/null -w 'WSL:%{http_code}\\n' http://127.0.0.1:8000/install.php"],
    capture_output=True, text=True, encoding='utf-8', timeout=10,
)
print(r.stdout.strip())

# 2. Windows 主机 curl
r = subprocess.run(
    ['curl', '-s', '-o', 'NUL', '-w', 'Windows:%{http_code}', 'http://localhost:8000/install.php'],
    capture_output=True, text=True, encoding='utf-8', timeout=10,
)
print(r.stdout)

# 3. PHP server 进程
r = subprocess.run(
    ['wsl', 'bash', '-c', "ps -ef | grep 'php -S' | grep -v grep"],
    capture_output=True, text=True, encoding='utf-8', timeout=10,
)
print('Process:', r.stdout.strip() if r.stdout.strip() else 'NO PROCESS')