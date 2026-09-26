#!/usr/bin/env python3
"""验证 PHP 内置 server 是否可访问：
1. WSL 内 curl http://127.0.0.1:8000/install.php
2. Windows 主机 curl http://localhost:8000/install.php
3. 抓取首页和 install.php 看返回内容"""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=20):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

# 1. WSL 内 curl
print('===== WSL 内 curl 127.0.0.1:8000/install.php =====')
r = run(['wsl', 'bash', '-c', "curl -s -o /tmp/_install.html -w 'HTTP:%{http_code} SIZE:%{size_download}\\n' http://127.0.0.1:8000/install.php"])
print(r.stdout)
if r.stderr:
    print('stderr:', r.stderr[:300])

# 看返回的前几行
r = run(['wsl', 'bash', '-c', "head -c 500 /tmp/_install.html"])
print('--- 返回内容前 500 字节 ---')
print(r.stdout)

# 2. Windows 主机 curl localhost:8000
print()
print('===== Windows 主机 curl localhost:8000 =====')
r = run(['curl', '-s', '-o', 'NUL', '-w', 'HTTP:%{http_code} SIZE:%{size_download}', 'http://localhost:8000/install.php'])
print(r.stdout)
if r.stderr:
    print('stderr:', r.stderr[:300])

# 3. 首页（应跳转到 install.php 或显示 index.php）
print()
print('===== 首页 curl =====')
r = run(['wsl', 'bash', '-c', "curl -s -o /tmp/_index.html -w 'HTTP:%{http_code} SIZE:%{size_download}\\n' http://127.0.0.1:8000/"])
print(r.stdout)
r = run(['wsl', 'bash', '-c', "head -c 500 /tmp/_index.html"])
print('--- 首页前 500 字节 ---')
print(r.stdout)

# 4. server 进程探测
print()
print('===== WSL 内 PHP server 进程 =====')
r = run(['wsl', 'bash', '-c', "ps -ef 2>/dev/null | grep -E 'php -S' | grep -v grep || echo no php-S process"])
print(r.stdout)