#!/usr/bin/env python3
"""精确模拟 AIX-WORK 的 runHealthCheck 逻辑"""
import json, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'

# 1. 读 .mcp.json 取真实配置（模拟 state.mcpServers[baota-mcp]）
with open('C:/Users/huxu/AI/.mcp.json', 'r', encoding='utf-8') as f:
    cfg = json.load(f)
bm = cfg['mcpServers']['baota-mcp']
print('===== 1. .mcp.json 里 baota-mcp 实际配置 =====')
print(json.dumps(bm, indent=2, ensure_ascii=False))

# 2. 模拟 health check 的 argv（精确复现 lib/index.js line 716-719）
print()
print('===== 2. 模拟 health check argv =====')
init_body = json.dumps({
    'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
    'params': {'protocolVersion': '2024-11-05', 'capabilities': {},
               'clientInfo': {'name': 'aix-work-health', 'version': '1.0.0'}}
})
devnull = 'NUL'  # Windows
argv = ['curl', '-s', '-o', devnull, '-w', '%{http_code}', '--max-time', '8',
        '-H', 'Accept: application/json, text/event-stream']
# if (config.headers) —— AIX-WORK 把 config.headers 加进 argv
for k, v in (bm.get('headers') or {}).items():
    argv += ['-H', f'{k}: {v}']
argv += ['-X', 'POST', '-H', 'Content-Type: application/json', '-d', init_body]
argv.append(URL)
print(f'argv 长度: {len(argv)} 个参数')
for a in argv:
    print(f'  {a}')

# 3. 执行
print()
print('===== 3. 实际跑这个 argv =====')
r = subprocess.run(argv, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
print(f'exit: {r.returncode}')
print(f'stdout (HTTP code): {r.stdout.strip()!r}')
print(f'stderr (前 500): {r.stderr[:500]}')

# 4. parseInt
code = r.stdout.strip()
cn = int(code) if code.isdigit() else 0
print(f'cn = {cn}, 状态: {"green" if cn > 0 else "red"} (error: {"No response" if cn == 0 else "OK"})')

# 5. 同时再跑一次（看是否偶发）
print()
print('===== 4. 第二次跑（验证稳定性）=====')
r = subprocess.run(argv, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
print(f'HTTP code: {r.stdout.strip()!r}')

# 6. WSL 内 baota 服务是否还稳
print()
print('===== 5. WSL 内 baota 服务现状 =====')
r = subprocess.run(['wsl', 'bash', '-c', '''
ps -p 497 -o pid,etime,cmd 2>/dev/null || echo "process gone"
ss -tlnp 2>/dev/null | grep 8765 || echo "no 8765 listener"
'''], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10)
print(r.stdout)