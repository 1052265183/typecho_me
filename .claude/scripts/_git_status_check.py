#!/usr/bin/env python3
"""详细查 dsh-plugins git 状态 + 文件 sha"""
import subprocess, hashlib, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')

def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

# HEAD 信息
r = run(['git', '-C', 'E:/deepseek_work/dsh-plugins', 'log', '--oneline', '-5'])
print('HEAD log:')
print(r.stdout)

# HEAD 文件大小（cat-file -s）
r = run(['git', '-C', 'E:/deepseek_work/dsh-plugins', 'cat-file', '-s', 'HEAD:aix-work/lib/index.js'])
print(f'HEAD aix-work/lib/index.js bytes: {r.stdout.strip()}')

# diff --stat
r = run(['git', '-C', 'E:/deepseek_work/dsh-plugins', 'diff', '--stat', 'aix-work/lib/index.js'])
print(f'diff --stat: {r.stdout!r}')

# SHA 对比
paths = [
    r'E:\deepseek_work\dsh-plugins\aix-work\lib\index.js',
    r'E:\deepseek_work\dsh-plugins\aix-work\lib\index.js.bak.before-configSection',
]
for p in paths:
    if os.path.exists(p):
        print(f'  {p}: {os.path.getsize(p)} bytes, sha={sha(p)[:16]}')

# .claude/tmp
print()
print('aix-work/.claude/tmp/ contents:')
for f in sorted(os.listdir('E:/deepseek_work/dsh-plugins/aix-work/.claude/tmp')):
    print(f'  tmp/{f}')