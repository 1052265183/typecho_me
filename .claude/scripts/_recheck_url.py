#!/usr/bin/env python3
"""用用户提供的 URL 再做一次完整测试：HEAD/GET/POST 各试一次 + 抓完整响应"""
import json, sys, ssl, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'
TOKEN = 'btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4'

def req(method, body=None, skip_tls=True):
    ctx = ssl.create_default_context()
    if skip_tls:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    headers = {
        'Authorization': f'Bearer {TOKEN}',
        'Accept': 'application/json, text/event-stream',
    }
    if body is not None:
        headers['Content-Type'] = 'application/json'
    r = urllib.request.Request(URL, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=10) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

init = json.dumps({
    'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
    'params': {'protocolVersion': '2024-11-05', 'capabilities': {},
               'clientInfo': {'name': 'recheck', 'version': '1.0'}}
}).encode()

# 1. GET
print('===== 1. GET（看是否有友好提示）=====')
status, headers, body = req('GET')
print(f'  HTTP {status}')
for k, v in headers.items():
    if k.lower() in ('server', 'content-type', 'date', 'x-powered-by', 'set-cookie', 'location'):
        print(f'    {k}: {v}')
print(f'  Body: {body[:300]!r}')

# 2. POST initialize
print()
print('===== 2. POST initialize =====')
status, headers, body = req('POST', init)
print(f'  HTTP {status}')
for k, v in headers.items():
    if k.lower() in ('server', 'content-type', 'date', 'x-powered-by', 'set-cookie', 'www-authenticate'):
        print(f'    {k}: {v}')
print(f'  Body: {body[:300]!r}')

# 3. POST 不带 token（验证 IP 检查 vs auth 检查顺序）
print()
print('===== 3. POST 无 token（看是否还是 ip denied）=====')
status, headers, body = req('POST', init, skip_tls=True)
# 重写不带 token
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
r = urllib.request.Request(URL, data=init, headers={
    'Content-Type': 'application/json',
}, method='POST')
try:
    with urllib.request.urlopen(r, context=ctx, timeout=10) as resp:
        print(f'  HTTP {resp.status}: {resp.read()[:200]!r}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  Body: {e.read()[:200]!r}')