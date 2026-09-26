#!/usr/bin/env python3
"""验证 Windows 主机能否连到 baota MCP 服务 + 验证证书是否需要重新信任"""
import subprocess, sys, socket, os, ssl
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URLS = [
    ('local_host',  'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'),
    ('public_host', 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp'),  # 同 URL（同 mcp_info）
]

# 1. 解析两个 hostname 的 IP（可能指向同一地址）
print('===== DNS 解析两个 URL 的主机 =====')
for label, url in URLS:
    from urllib.parse import urlparse
    host = urlparse(url).hostname
    port = urlparse(url).port or 443
    try:
        ip = socket.gethostbyname(host)
        print(f'  [{label}] {host} -> {ip}:{port}')
    except Exception as e:
        print(f'  [{label}] {host} -> FAIL: {e}')

# 2. TCP 连通性（Windows 视角）
print()
print('===== Windows TCP 8765 连通性 =====')
for label, url in URLS:
    from urllib.parse import urlparse
    host = urlparse(url).hostname
    port = urlparse(url).port or 443
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    try:
        s.connect((host, port))
        print(f'  [{label}] {host}:{port} TCP OK')
    except Exception as e:
        print(f'  [{label}] {host}:{port} TCP FAIL: {e}')
    finally:
        s.close()

# 3. HTTPS 握手（用现有 baota_root_ca.crt）
print()
print('===== HTTPS 握手（验证证书链） =====')
import urllib.request
cert_path = Path(os.path.expanduser('~/.claude/baota_root_ca.crt'))
for label, url in URLS:
    try:
        ctx = ssl.create_default_context(cafile=str(cert_path))
        req = urllib.request.Request(url, headers={
            'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
            'Accept': 'text/event-stream',
        })
        # 只试握手不发请求：socket-level SSL handshake
        from urllib.parse import urlparse
        host = urlparse(url).hostname
        port = urlparse(url).port or 443
        with socket.create_connection((host, port), timeout=5) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                print(f'  [{label}] HTTPS 握手 OK')
                print(f'    subject: {cert.get("subject")}')
                print(f'    SAN: {[v for k, v in cert.get("subjectAltName", [])]}')
    except ssl.SSLCertVerificationError as e:
        print(f'  [{label}] SSL 验证失败: {e}')
    except Exception as e:
        print(f'  [{label}] 其他错误: {type(e).__name__}: {e}')

# 4. 检查现有证书完整度
print()
print('===== 现有 baota_root_ca.crt 完整性 =====')
import re
text = cert_path.read_text(encoding='utf-8')
certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', text, re.DOTALL)
print(f'  证书数: {len(certs)}')
print(f'  字符数: {[len(c) for c in certs]}')
print(f'  目标字符数 (mcp_info.json tls_cert): [1821, 1869, 1878]')
print(f'  是否一致: {len(certs) == 3 and [len(c) for c in certs] == [1821, 1869, 1878]}')