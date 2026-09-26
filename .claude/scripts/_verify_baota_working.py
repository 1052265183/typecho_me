#!/usr/bin/env python3
"""检查 baota-mcp 实际可用性：用 -k 模拟 DSH 原生 MCP 的 fetch 行为"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'

# 1. tools/list（拿工具列表）
print('===== 1. tools/list =====')
r = subprocess.run([
    'curl', '-sk', '--max-time', '15',
    '-H', 'Accept: application/json, text/event-stream',
    '-H', 'Authorization: Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
    '-X', 'POST', '-H', 'Content-Type: application/json',
    '-d', '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}',
    URL,
], capture_output=True, timeout=20)
out = r.stdout.decode('utf-8', errors='replace') if r.stdout else ''
print('exit:', r.returncode)
print('body 前 800:', out[:800])

# 2. 解析工具数
import re, json
m = re.search(r'\{"result":\s*\{[^}]*"tools":\s*\[(.*?)\]\s*\}', out, re.DOTALL)
if m:
    tools_str = m.group(1)
    # 简单数每个 "name": "..." 出现次数
    names = re.findall(r'"name":\s*"([^"]+)"', tools_str)
    print()
    print(f'===== 2. 工具数量: {len(names)} =====')
    print('前 10 个工具名:')
    for n in names[:10]:
        print(f'  - {n}')
else:
    print()
    print('===== 2. 解析失败 =====')
    print(out[:500])