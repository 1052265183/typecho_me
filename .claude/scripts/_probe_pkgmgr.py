#!/usr/bin/env python3
"""探测 Windows 包管理器"""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=20):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

for mgr in ['winget', 'choco', 'scoop']:
    r = run(['where', mgr])
    print(mgr + ':', r.stdout.strip() or 'NOT FOUND')

# winget 列出 PHP 相关包
print()
print('===== winget search php =====')
r = run(['winget', 'search', 'php', '--accept-source-agreements'])
print(r.stdout[:2000] if r.stdout else '(empty)')
if r.stderr:
    print('stderr:', r.stderr[:500])

# 已有 docker 吗
print()
print('===== docker =====')
r = run(['where', 'docker'])
print('docker:', r.stdout.strip() or 'NOT FOUND')
r = run(['where', 'docker-compose'])
print('docker-compose:', r.stdout.strip() or 'NOT FOUND')