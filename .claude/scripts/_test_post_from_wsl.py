#!/usr/bin/env python3
"""用 POST 请求 + WSL 内 curl，确认服务端是否一致返回 ip denied"""
import json, ssl, sys, urllib.request, urllib.error, subprocess
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'
TOKEN = 'btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4'

# MCP initialize body
init = json.dumps({
    'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
    'params': {'protocolVersion': '2024-11-05', 'capabilities': {},
               'clientInfo': {'name': 'diag', 'version': '1.0'}}
}).encode()

# 1. Windows 主机 POST（跳过 TLS 看响应）
print('===== 测试: Windows POST + 跳过 TLS =====')
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
try:
    req = urllib.request.Request(URL, data=init, headers={
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    }, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
        print(f'  状态码: {r.status}')
        print(f'  响应: {r.read()[:500]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  Body: {e.read()[:500]!r}')

# 2. WSL 内 POST（localhost 方式可能 IP 是 127.0.0.1，被服务端信任）
print()
print('===== 测试: WSL 内 POST 到 localhost:8765 =====')
script = f'''
curl -sk -X POST 'https://localhost:8765/bt-mcp-hcDq2niRl5HW/mcp' \\
  -H 'Authorization: Bearer {TOKEN}' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{init.decode()}' \\
  -w '\\nHTTP:%{{http_code}}\\n' 2>&1
'''
r = subprocess.run(['wsl', 'bash', '-c', script],
                   capture_output=True, text=True, timeout=10)
print(r.stdout)

# 3. WSL 内 POST 到 eth0 IP（172.29.51.111）
print()
print('===== 测试: WSL 内 POST 到 eth0 IP =====')
script = f'''
curl -sk -X POST '{URL}' \\
  -H 'Authorization: Bearer {TOKEN}' \\
  -H 'Content-Type: application/json' \\
  -d '{init.decode()}' \\
  -w '\\nHTTP:%{{http_code}}\\n' 2>&1 | head -30
'''
r = subprocess.run(['wsl', 'bash', '-c', script],
                   capture_output=True, text=True, timeout=10)
print(r.stdout)