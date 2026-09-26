#!/usr/bin/env python3
"""baota-mcp 失败排查：模拟 DSH 客户端的请求，覆盖 4 种常见失败模式"""
import json, os, sys, urllib.request, urllib.error, ssl, socket
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'
TOKEN = 'btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4'
CERT_PATH = os.path.expanduser('~/.claude/baota_root_ca.crt')

# 1. 完整 curl 模拟 DSH 客户端（MCP 协议要求 POST + Accept: text/event-stream）
print('===== 测试 1: 模拟 DSH 客户端发 MCP initialize 请求 =====')
import uuid
init_body = json.dumps({
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'initialize',
    'params': {
        'protocolVersion': '2024-11-05',
        'capabilities': {},
        'clientInfo': {'name': 'diagnose-script', 'version': '1.0'}
    }
}).encode()

# 1a. 不带证书（系统默认 CA）
print('\n--- 1a: 默认系统 CA（无 NODE_EXTRA_CA_CERTS）---')
try:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(URL, data=init_body, headers={
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    }, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        print(f'  状态码: {resp.status}')
        print(f'  响应: {resp.read()[:300]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  Body: {e.read()[:300]!r}')
except ssl.SSLCertVerificationError as e:
    print(f'  SSL 验证失败: {e.reason}')
except Exception as e:
    print(f'  其他错误: {type(e).__name__}: {e}')

# 1b. 带 NODE_EXTRA_CA_CERTS（方式 C 模拟）
print('\n--- 1b: 带 baota_root_ca.crt（方式 C 模拟）---')
try:
    ctx = ssl.create_default_context(cafile=CERT_PATH)
    req = urllib.request.Request(URL, data=init_body, headers={
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    }, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        print(f'  状态码: {resp.status}')
        print(f'  响应: {resp.read()[:300]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  Body: {e.read()[:300]!r}')
except ssl.SSLCertVerificationError as e:
    print(f'  SSL 验证失败: {e.reason[:200]}')
except Exception as e:
    print(f'  其他错误: {type(e).__name__}: {e}')

# 1c. 跳过 TLS 验证（方式 E 模拟）
print('\n--- 1c: 跳过 TLS 验证（方式 E 模拟，验证连通性 + auth）---')
try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(URL, data=init_body, headers={
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    }, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        print(f'  状态码: {resp.status}')
        print(f'  响应: {resp.read()[:300]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  Body: {e.read()[:500]!r}')
except Exception as e:
    print(f'  其他错误: {type(e).__name__}: {e}')

# 1d. 不带 token（验证服务端响应什么）
print('\n--- 1d: 不带 Authorization 头（看是否返回 401）---')
try:
    ctx = ssl.create_default_context(cafile=CERT_PATH)
    req = urllib.request.Request(URL, data=init_body, headers={
        'Content-Type': 'application/json',
    }, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        print(f'  状态码: {resp.status}')
        print(f'  响应: {resp.read()[:300]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  Body: {e.read()[:300]!r}')
except Exception as e:
    print(f'  其他错误: {type(e).__name__}: {e}')

# 2. 证书 SAN 检查（hostname/IP 是否匹配）
print('\n===== 测试 2: 证书 SAN 检查 =====')
import subprocess
try:
    r = subprocess.run(
        ['openssl', 's_client', '-connect', '172.29.51.111:8765',
         '-servername', '172.29.51.111', '-showcerts'],
        input=b'', capture_output=True, timeout=10,
    )
    # 输出含证书，PEM 格式
    output = r.stdout.decode('utf-8', errors='replace')
    # 找 leaf 证书的 subjectAltName
    import re
    san_match = re.search(r'Subject Alternative Name:\s*(.+?)(?=\n\s*\n|\n---)', output, re.DOTALL)
    if san_match:
        print(f'  Leaf 证书 SAN: {san_match.group(1).strip()}')
    else:
        print(f'  未找到 SAN，输出片段:')
        for line in output.splitlines()[:30]:
            print(f'    {line}')
except Exception as e:
    print(f'  openssl 调用失败: {e}')

# 3. 端口连通性再确认
print('\n===== 测试 3: 端口连通性 + 服务进程 =====')
r = subprocess.run(['wsl', 'bash', '-c',
    "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' | grep -E 'bt-mcp|btmcp|baota|bt' || echo 'no baota container'"],
    capture_output=True, text=True, timeout=10)
print(f'  WSL 容器: {r.stdout.strip()}')