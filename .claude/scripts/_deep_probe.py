#!/usr/bin/env python3
"""深查 baota 服务状态"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def wsl(cmd, timeout=60):
    return subprocess.run(['wsl', 'bash', '-c', cmd],
                          capture_output=True, text=True, encoding='utf-8',
                          errors='replace', timeout=timeout)

# 1. 进程详细信息
print('===== 1. python3 pid=488 详细信息 =====')
r = wsl('''
echo '--- ps -ef | grep python3 ---'
ps -ef | grep -E "python3.*(8765|baota|bt-mcp|fastmcp)" | grep -v grep
echo '--- /proc/488/status (前 30 行) ---'
cat /proc/488/status 2>/dev/null | head -25
echo '--- /proc/488/net/tcp (LISTEN 状态) ---'
awk '$4 == "0A" { print }' /proc/488/net/tcp 2>/dev/null | head -20
echo '--- /proc/488/cmdline ---'
tr '\\0' ' ' < /proc/488/cmdline; echo
''')
print(r.stdout)

# 2. nc 测试连接
print()
print('===== 2. WSL 内 nc 测试端口连通性 =====')
r = wsl('''
echo '--- nc -z -v localhost 8765 ---'
nc -z -v -w 5 localhost 8765 2>&1 || echo "nc failed"
echo '--- nc -z -v 127.0.0.1 8765 ---'
nc -z -v -w 5 127.0.0.1 8765 2>&1 || echo "nc failed"
echo '--- nc -z -v 172.29.51.111 8765 ---'
nc -z -v -w 5 172.29.51.111 8765 2>&1 || echo "nc failed"
''')
print(r.stdout)

# 3. WSL 防火墙
print()
print('===== 3. WSL 防火墙（iptables）=====')
r = wsl('''
echo '--- iptables -L INPUT (前 20) ---'
sudo iptables -L INPUT 2>&1 | head -20 || echo "no sudo / iptables"
echo '--- iptables -t filter -nvL ---'
sudo iptables -t filter -nvL 2>&1 | head -30 || echo "no sudo"
''')
print(r.stdout)

# 4. WSL 内 TCP 8765 详细连接
print()
print('===== 4. WSL 内 ss 看 8765 详细 =====')
r = wsl('''
echo '--- ss -tlnep 8765 ---'
ss -tlnep 2>/dev/null | grep -E "8765|python3"
echo '--- ss -tna 所有 LISTEN ---'
ss -tln 2>/dev/null | head -20
''')
print(r.stdout)

# 5. WSL 内 curl -v 看为什么连不上
print()
print('===== 5. WSL 内 curl localhost:8765 -v =====')
r = wsl('curl -k -v --max-time 10 https://localhost:8765/bt-mcp-hcDq2niRl5HW/mcp 2>&1 | head -30')
print(r.stdout)

# 6. 看 python3 进程的系统级资源占用（CPU/IO）
print()
print('===== 6. python3 资源占用 =====')
r = wsl('''
echo '--- top -b -n 1 -p 488 ---'
top -b -n 1 -p 488 2>/dev/null | tail -10
echo '--- /proc/488/io ---'
cat /proc/488/io 2>/dev/null
echo '--- /proc/488/status 关键 ---'
grep -E "State|Threads|VmRSS" /proc/488/status 2>/dev/null
''')
print(r.stdout)