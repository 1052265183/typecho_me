#!/usr/bin/env python3
"""对比 WSL/Windows 路由 + 测试各种路径"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def wsl(cmd, timeout=30):
    return subprocess.run(['wsl', 'bash', '-c', cmd],
                          capture_output=True, text=True, encoding='utf-8',
                          errors='replace', timeout=timeout)

# 1. WSL 当前状态
print('===== 1. WSL 启动时间 + 网络模式 =====')
r = wsl('''
echo '--- wsl uptime ---'
cat /proc/uptime
echo '--- 网卡 ---'
ip -4 addr show eth0
echo '--- WSL 版本 ---'
cat /proc/version | head -1
echo '--- 路由表 172.29 ---'
ip route | grep 172.29 || echo "no 172.29 route"
''')
print(r.stdout)

# 2. WSL 内各种地址 curl
print()
print('===== 2. WSL 内 curl 测试各种地址 =====')
r = wsl('''
echo '--- curl localhost:8765 ---'
curl -sk --max-time 5 -o /dev/null -w 'localhost: HTTP %{http_code}\\n' https://localhost:8765/bt-mcp-hcDq2niRl5HW/mcp 2>&1
echo '--- curl 127.0.0.1:8765 ---'
curl -sk --max-time 5 -o /dev/null -w '127.0.0.1: HTTP %{http_code}\\n' https://127.0.0.1:8765/bt-mcp-hcDq2niRl5HW/mcp 2>&1
echo '--- curl 172.29.51.111:8765 ---'
curl -sk --max-time 5 -o /dev/null -w '172.29.51.111: HTTP %{http_code}\\n' https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp 2>&1
''')
print(r.stdout)

# 3. Windows curl 各种地址
print()
print('===== 3. Windows curl 各种地址 =====')
for url in [
    'https://localhost:8765/bt-mcp-hcDq2niRl5HW/mcp',
    'https://127.0.0.1:8765/bt-mcp-hcDq2niRl5HW/mcp',
    'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp',
]:
    r = subprocess.run(['curl', '-sk', '--max-time', '8', '-o', 'NUL',
                        '-w', f'{url}: HTTP %{{http_code}}', url],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=12)
    print(r.stdout)

# 4. Windows 路由看 172.29 怎么走
print()
print('===== 4. Windows 路由表（172.29 段）=====')
r = subprocess.run(['route', 'print', '172.29.0.0'], capture_output=True)
text = r.stdout.decode('gbk', errors='replace')
for line in text.splitlines()[:20]:
    print(f'  {line}')

# 5. AIX-WORK health check 的实际效果
print()
print('===== 5. AIX-WORK health check 模拟（带 -X POST）=====')
URL = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'
r = subprocess.run(['curl', '-sk', '--max-time', '8',
                    '-H', 'Accept: application/json, text/event-stream',
                    '-X', 'POST', '-d', '{}',
                    '-w', 'HTTP %{http_code}', URL],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=12)
print(r.stdout[:500])