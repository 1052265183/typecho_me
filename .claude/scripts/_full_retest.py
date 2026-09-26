#!/usr/bin/env python3
"""全量重新测试 baota-mcp 服务可达性"""
import subprocess, sys, ssl, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'

def wsl(cmd, timeout=60):
    return subprocess.run(['wsl', 'bash', '-c', cmd],
                          capture_output=True, text=True, encoding='utf-8',
                          errors='replace', timeout=timeout)

# 1. WSL 内能否连（不绕 Windows 网络栈）
print('===== 1. WSL 内 curl 到 172.29.51.111 =====')
r = wsl('curl -sk -o /dev/null -w "HTTP:%{http_code}\\n" --max-time 10 https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp 2>&1')
print(r.stdout)

# 2. WSL 内 POST initialize
print('===== 2. WSL 内 POST initialize =====')
r = wsl('''curl -sk -X POST 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"wsl-retest","version":"1.0"}}}' \\
  -w '\\nHTTP:%{http_code}\\n' --max-time 15 2>&1 | head -30''')
print(r.stdout)

# 3. Python urllib 直连（用 baota_root_ca.crt）
print('===== 3. Python https（带 baota_root_ca.crt）=====')
init_body = b'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"py-test","version":"1.0"}}}'
try:
    ctx = ssl.create_default_context(cafile='C:/Users/huxu/.claude/baota_root_ca.crt')
    req = urllib.request.Request(URL, data=init_body, headers={
        'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    }, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        print(f'  HTTP {r.status}')
        print(f'  body: {r.read()[:300]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  body: {e.read()[:300]!r}')
except Exception as e:
    print(f'  ERROR: {type(e).__name__}: {e}')

# 4. Python https 跳过 TLS 验证
print()
print('===== 4. Python https（reject check）=====')
try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(URL, data=init_body, headers={
        'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    }, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        print(f'  HTTP {r.status}')
        print(f'  body: {r.read()[:300]}')
except urllib.error.HTTPError as e:
    print(f'  HTTP {e.code}: {e.reason}')
    print(f'  body: {e.read()[:300]!r}')
except Exception as e:
    print(f'  ERROR: {type(e).__name__}: {e}')

# 5. WSL 内 docker 状态
print()
print('===== 5. WSL docker 状态（看 mysql_ni7e / typecho / baota 容器）=====')
r = wsl('docker ps -a --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}" 2>&1')
print(r.stdout)

# 6. 看 8765 端口在 WSL 内谁监听
print()
print('===== 6. WSL 内 8765 端口监听者 =====')
r = wsl('''
echo '--- ss -tlnp 8765 ---'
ss -tlnp 2>/dev/null | grep 8765 || echo "no listener"
echo '--- netstat -tlnp 8765 ---'
netstat -tlnp 2>/dev/null | grep 8765 || echo "no listener (fallback)"
echo '--- lsof -i :8765 ---'
lsof -i :8765 2>/dev/null || echo "no lsof"
echo '--- 看哪些进程监听 ---'
for pid in $(pgrep -f uvicorn 2>/dev/null) $(pgrep -f fastmcp 2>/dev/null) $(pgrep -f baota 2>/dev/null) $(pgrep -f bt-mcp 2>/dev/null); do
  echo "  pid=$pid: $(ps -p $pid -o comm= 2>/dev/null)"
done
''')
print(r.stdout)