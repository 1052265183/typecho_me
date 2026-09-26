#!/usr/bin/env python3
"""列出 Windows 主机的所有非 loopback IP，作为服务端 IP 白名单的参考"""
import socket, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. Windows 网卡 IP
print('===== Windows 网卡 IPv4 =====')
r = subprocess.run(['ipconfig'], capture_output=True, timeout=10)
text = r.stdout.decode('gbk', errors='replace')
for line in text.splitlines():
    if 'IPv4' in line:
        print(f'  {line.strip()}')

# 2. 用 socket 模拟出网，看服务端会看到哪个 IP
print()
print('===== 出网 IP 探测（向 MCP 服务端发起 TCP 连接，从响应看服务端看到什么）=====')
import urllib.request, urllib.error, ssl

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'

# 跳过 TLS 看 403 响应（已知服务端会拒绝）
try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(URL, headers={'Authorization': 'Bearer x'})
    with urllib.request.urlopen(req, context=ctx, timeout=5) as r:
        print(f'  状态: {r.status}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    body = e.read().decode('utf-8', errors='replace')
    print(f'  响应: {body}')
except Exception as e:
    print(f'  错误: {type(e).__name__}: {e}')

# 3. 用 mtraceroute 看跳数路径
print()
print('===== Windows 路由表（默认网关）=====')
r = subprocess.run(['route', 'print', '0.0.0.0'], capture_output=True, timeout=10)
text2 = r.stdout.decode('gbk', errors='replace')
for line in text2.splitlines()[:15]:
    print(f'  {line}')

# 4. 用公网 IP 查询服务（拿真实出网 IP）
print()
print('===== 公网出网 IP（服务端看到的）=====')
for url in ['https://api.ipify.org', 'https://ifconfig.me/ip']:
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'curl/8.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=5) as r:
            print(f'  {url}: {r.read().decode().strip()}')
    except Exception as e:
        print(f'  {url}: FAIL {e}')