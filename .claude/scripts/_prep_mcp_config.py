#!/usr/bin/env python3
"""读现有 MCP 配置 + 探测网络位置 + 比对现有证书"""
import os, subprocess, sys, json
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=30):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

# 1. 读 ~/.dsh/settings.yaml
print('===== ~/.dsh/settings.yaml（前 200 行） =====')
p = Path(os.path.expanduser('~/.dsh/settings.yaml'))
if p.exists():
    text = p.read_text(encoding='utf-8', errors='replace')
    lines = text.splitlines()
    for i, line in enumerate(lines[:200], 1):
        print(f'{i:3}|{line}')

# 2. 找 mcp 相关文件
print()
print('===== 找 mcp 相关文件 =====')
for path in [
    Path(os.path.expanduser('~/.dsh')),
    Path(os.path.expanduser('~/.claude')),
    Path(os.path.expanduser('~/.dsh/profiles/web')),
]:
    for p in path.rglob('*'):
        if p.is_file() and ('mcp' in p.name.lower() or 'btmcp' in p.name.lower()):
            print(f'  {p}')

# 3. Windows 主机网卡 IP
print()
print('===== Windows 主机网卡 IP =====')
r = run(['ipconfig'])
for line in r.stdout.splitlines():
    if 'IPv4' in line or 'IP Address' in line or '172.' in line or '10.' in line or '192.168' in line:
        print(' ', line)

# 4. WSL 内 IP
print()
print('===== WSL 内 IP =====')
r = run(['wsl', 'bash', '-c', 'hostname -I 2>&1; ip -4 addr show 2>&1 | grep inet'])
print(r.stdout)

# 5. 测试到 172.29.51.111:8765 连通性（仅 TCP）
print()
print('===== 测试 172.29.51.111:8765 TCP 连通性 =====')
import socket
for host in ['172.29.51.111']:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    try:
        s.connect((host, 8765))
        print(f'  {host}:8765 TCP OK')
    except Exception as e:
        print(f'  {host}:8765 FAIL: {e}')
    finally:
        s.close()

# 6. 比对现有证书
print()
print('===== 现有证书 vs 目标证书链 =====')
import re
existing = Path('C:/Users/huxu/.claude/baota_root_ca.crt')
if existing.exists():
    text = existing.read_text(encoding='utf-8', errors='replace')
    certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', text, re.DOTALL)
    print(f'  baota_root_ca.crt: {len(certs)} 张证书, 字符数={[len(c) for c in certs]}')

for n in [1, 2, 3]:
    p = Path(f'C:/Users/huxu/.claude/cert{n}.pem')
    if p.exists():
        text = p.read_text(encoding='utf-8', errors='replace')
        certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', text, re.DOTALL)
        print(f'  cert{n}.pem: {len(certs)} 张证书, 字符数={[len(c) for c in certs] if certs else 0}')

# 7. 读 mcp_info.json 的完整 tls_cert（之前被截断）
print()
print('===== 完整 tls_cert（前 200 字符） =====')
md = Path('C:/Users/huxu/Downloads/mcp_self_config.md')
text = md.read_text(encoding='utf-8')
m = re.search(r'"tls_cert":\s*"((?:[^"\\]|\\.)*)"', text)
if m:
    cert = m.group(1).encode().decode('unicode_escape')
    print(f'  tls_cert 总长度: {len(cert)} 字符')
    certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', cert, re.DOTALL)
    print(f'  包含证书数: {len(certs)}')
    for i, c in enumerate(certs, 1):
        print(f'    [{i}] {len(c)} 字符, 前 60 字符: {c[:60]}...')