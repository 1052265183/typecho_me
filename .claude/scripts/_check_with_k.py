#!/usr/bin/env python3
"""用 -k 跑 health check，看服务端实际可达性"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'
init_body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"1.0"}}}'
r = subprocess.run([
    'curl', '-sk', '--max-time', '8',
    '-H', 'Accept: application/json, text/event-stream',
    '-H', 'Authorization: Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
    '-X', 'POST', '-H', 'Content-Type: application/json',
    '-d', init_body,
    '-w', '\nHTTP: %{http_code}',
    URL,
], capture_output=True, timeout=15)
print('exit:', r.returncode)
stdout = r.stdout.decode('utf-8', errors='replace') if r.stdout else ''
print('stdout:', stdout[:800])