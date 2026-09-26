#!/usr/bin/env python3
"""curl 直接测试 baota-mcp 的 URL，确认 TCP/TLS 是否可达"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'

# 1. Windows 上 curl 是否可用
print('===== 1. where curl =====')
r = subprocess.run(['where', 'curl'], capture_output=True, text=True)
print(r.stdout.strip() or 'NOT FOUND')

# 2. curl -v 看详细
print()
print('===== 2. curl -v --max-time 30 =====')
r = subprocess.run(
    ['curl', '-v', '--max-time', '30', '-X', 'POST',
     '-H', 'Content-Type: application/json',
     '-H', 'Accept: application/json, text/event-stream',
     '-d', '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0"}}}',
     URL],
    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=35
)
print('-- stderr (verbose) --')
print(r.stderr[:1500])
print('-- stdout --')
print(r.stdout[:500])
print(f'exit: {r.returncode}')

# 3. curl --resolve 测试（强制 hostname 解析）
print()
print('===== 3. curl --max-time 10 看 TCP 是否通 =====')
r = subprocess.run(
    ['curl', '-v', '--max-time', '10', URL],
    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15
)
print('stderr (前 800 字符):')
print(r.stderr[:800])
print(f'exit: {r.returncode}')