#!/usr/bin/env python3
"""比对三份 mcp 指令文件是否完全一致（hash 比对）"""
import hashlib, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

files = [
    Path(r'C:\Users\huxu\Downloads\mcp_self_config.md'),         # 第一次给的本地路径
    Path(r'C:\Users\huxu\Downloads\mcp_self_config (1).md'),     # 现在给的本地路径
]

# URL 文件下载后的内容（前面已读过，但重新下载做精确比对）
import urllib.request
url_content_path = Path(r'C:\Users\huxu\Downloads\_mcp_url_dl.md')
try:
    urllib.request.urlretrieve(
        'http://localhost:29939/down/yn41B9vv4ZsE.md',
        url_content_path
    )
    files.append(url_content_path)
except Exception as e:
    print(f'URL 文件下载失败: {e}')

print('===== 三份文件 SHA256 比对 =====')
hashes = {}
for p in files:
    if not p.exists():
        print(f'  [SKIP] {p} 不存在')
        continue
    text = p.read_bytes()
    h = hashlib.sha256(text).hexdigest()
    hashes[p.name] = (h, len(text))
    print(f'  {p.name}')
    print(f'    大小: {len(text)} bytes')
    print(f'    SHA256: {h[:16]}...{h[-8:]}')

print()
unique_hashes = {h[0] for h in hashes.values()}
if len(unique_hashes) == 1:
    print(f'  ✅ 三份文件哈希完全一致（SHA256: {list(unique_hashes)[0][:16]}...）')
else:
    print(f'  ❌ 三份文件哈希不一致，共 {len(unique_hashes)} 个不同')
    for name, (h, _) in hashes.items():
        print(f'    {name}: {h[:16]}...')

# 清理临时下载
if url_content_path.exists():
    url_content_path.unlink()