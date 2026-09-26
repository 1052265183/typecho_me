#!/usr/bin/env python3
"""解析 baota-mcp 完整工具列表"""
import re, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'
r = subprocess.run([
    'curl', '-sk', '--max-time', '15',
    '-H', 'Accept: application/json, text/event-stream',
    '-H', 'Authorization: Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
    '-X', 'POST', '-H', 'Content-Type: application/json',
    '-d', '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}',
    URL,
], capture_output=True, timeout=20)
out = r.stdout.decode('utf-8', errors='replace') if r.stdout else ''

# 提取所有工具名（更宽松，能处理转义）
names = re.findall(r'"name":"((?:[^"\\]|\\.)*)"', out)
print(f'工具总数: {len(names)}')
print()
print('所有工具:')
for n in names:
    print(f'  - {n}')

# 同时看 serverInfo
m = re.search(r'"serverInfo":\{[^}]*"name":"([^"]+)"[^}]*"version":"([^"]+)"', out)
if m:
    print()
    print(f'serverInfo: {m.group(1)} {m.group(2)}')