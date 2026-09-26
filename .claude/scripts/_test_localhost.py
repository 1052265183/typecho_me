#!/usr/bin/env python3
"""测试 localhost:8765 是否通（WSL2 自动端口转发 vs 直接 IP）"""
import subprocess, sys, ssl, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. Windows curl localhost:8765
print('===== 1. Windows curl localhost:8765 =====')
r = subprocess.run(['curl', '-sk', '-o', '/dev/null', '-w', 'HTTP:%{http_code}',
                    '--max-time', '15', 'https://localhost:8765/bt-mcp-hcDq2niRl5HW/mcp'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20)
print(r.stdout)
if r.stderr: print('stderr:', r.stderr[:300])

# 2. Windows curl 127.0.0.1:8765
print()
print('===== 2. Windows curl 127.0.0.1:8765 =====')
r = subprocess.run(['curl', '-sk', '-o', '/dev/null', '-w', 'HTTP:%{http_code}',
                    '--max-time', '15', 'https://127.0.0.1:8765/bt-mcp-hcDq2niRl5HW/mcp'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20)
print(r.stdout)
if r.stderr: print('stderr:', r.stderr[:300])

# 3. WSL 内 curl localhost:8765
print()
print('===== 3. WSL 内 curl localhost:8765 =====')
r = subprocess.run(['wsl', 'bash', '-c',
    'curl -sk -o /dev/null -w "HTTP:%{http_code}\\n" --max-time 15 https://localhost:8765/bt-mcp-hcDq2niRl5HW/mcp 2>&1'],
    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25)
print(r.stdout)

# 4. Python urllib localhost:8765 跳过 TLS
print()
print('===== 4. Python urllib https://localhost:8765 (skip TLS) =====')
try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request('https://localhost:8765/bt-mcp-hcDq2niRl5HW/mcp',
        data=b'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"py-local","version":"1"}}}',
        headers={'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
                 'Content-Type': 'application/json',
                 'Accept': 'application/json, text/event-stream'},
        method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        print(f'  HTTP {r.status}')
        print(f'  body: {r.read()[:300]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  body: {e.read()[:300]!r}')
except Exception as e:
    print(f'  ERROR: {type(e).__name__}: {e}')