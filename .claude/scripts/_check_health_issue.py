#!/usr/bin/env python3
"""查 AIX-WORK health check 逻辑 + baota 服务健康"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=20):
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding='utf-8', errors='replace', timeout=timeout)

def wsl(cmd, timeout=60):
    return run(['wsl', 'bash', '-c', cmd], timeout=timeout)

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'

# 1. 检查 WSL 内 baota 服务是否真的在跑
print('===== 1. WSL 内 baota 服务状态 =====')
r = wsl('''
echo '--- ss -tlnp 8765 ---'
ss -tlnp 2>/dev/null | grep 8765 || echo "no listener"
echo '--- ps -ef 找 python/uvicorn ---'
ps -ef 2>/dev/null | grep -iE "python|uvicorn|baota|bt-mcp|fastmcp" | grep -v grep | head -10
''')
print(r.stdout)

# 2. 健康检查用的 curl 命令（看 AIX-WORK 怎么跑 health check）
print()
print('===== 2. 模拟 AIX-WORK 的 health check =====')
print('AIX-WORK 用 curl 模拟 health check:')
print('  curl -s -o devnull -w "%{http_code}" --max-time 8 \\')
print('       -H "Accept: application/json, text/event-stream" \\')
print('       https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp')
print()

r = run(['curl', '-s', '-o', 'NUL', '-w', '%{http_code}',
         '--max-time', '8', '-H', 'Accept: application/json, text/event-stream', URL],
        timeout=15)
print(f'Windows 模拟 health check: HTTP {r.stdout.strip()!r}')
if r.stderr: print(f'  stderr: {r.stderr[:300]}')

# 3. 不带 method body 的纯 GET
print()
print('===== 3. 不带 method body 的 GET =====')
r = run(['curl', '-sk', '-w', '%{http_code}', '--max-time', '8',
         '-H', 'Accept: application/json, text/event-stream', URL],
        timeout=15)
print(f'  HTTP {r.stdout.strip()[-3:]!r}')

# 4. 看 AIX-WORK 源码 health check 的具体位置
print()
print('===== 4. AIX-WORK 源码 health check 段 =====')
print('lib/index.js line 707-730 附近：')
print('  state.healthStatus[nm] = { status: "green", httpStatus: null, error: null };')
print('  } else if (config.type === "http" && config.url) {')
print('    const argv = ["curl", "-s", "-o", devnull, "-w", "%{http_code}", ...]')
print('    ...')
print('    state.healthStatus[nm] = {')
print('      status: cn > 0 ? "green" : "red",')
print('      httpStatus: cn,')
print('      error: cn === 0 ? "No response" : null')
print('    };')
print()
print('看 devnull 来源:')
r = run(['cmd', '/c', 'where', 'NUL'], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)