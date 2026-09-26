#!/usr/bin/env python3
"""下载用户指定的 Markdown 任务文件，按要求执行"""
import urllib.request, urllib.error, sys, socket
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'http://localhost:29939/down/yn41B9vv4ZsE.md'

# 1. 先测 TCP 连通性
print('===== 步骤 1: TCP 连通性测试 =====')
host = 'localhost'
port = 29939
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(10)
try:
    s.connect((host, port))
    print(f'  [OK] {host}:{port} TCP 连通')
except Exception as e:
    print(f'  [FAIL] {host}:{port} {type(e).__name__}: {e}')
    sys.exit(1)
finally:
    s.close()

# 2. 下载文件
print()
print('===== 步骤 2: 下载 Markdown =====')
try:
    req = urllib.request.Request(URL, headers={'User-Agent': 'python-task-loader/1.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        print(f'  [OK] HTTP {resp.status}')
        print(f'  Content-Type: {resp.headers.get("Content-Type")}')
        print(f'  Content-Length: {resp.headers.get("Content-Length")}')
        print(f'  实际字节数: {len(raw)}')
        text = raw.decode('utf-8', errors='replace')
        print()
        print('===== 文件内容 =====')
        print(text)
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  Body: {e.read()[:500]!r}')
except Exception as e:
    print(f'  [FAIL] {type(e).__name__}: {e}')