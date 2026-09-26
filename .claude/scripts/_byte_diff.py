#!/usr/bin/env python3
"""字节级 diff：HEAD vs 当前"""
import subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. 把 HEAD 版本写到临时文件
r = subprocess.run(['git', '-C', 'E:/deepseek_work/dsh-plugins', 'show', 'HEAD:aix-work/lib/index.js'],
                   capture_output=True)
with open('E:/deepseek_work/typecho/.claude/tmp/_head_aixwork.js', 'wb') as f:
    f.write(r.stdout)

# 2. 用 cmp / fc 比较
import platform
if platform.system() == 'Windows':
    r = subprocess.run(['fc', '/N', '/A',
                         'E:/deepseek_work/typecho/.claude/tmp/_head_aixwork.js',
                         'E:/deepseek_work/dsh-plugins/aix-work/lib/index.js'],
                       capture_output=True, text=True, encoding='gbk', errors='replace')
    print(r.stdout[:3000])
else:
    r = subprocess.run(['cmp', '-l',
                         'E:/deepseek_work/typecho/.claude/tmp/_head_aixwork.js',
                         'E:/deepseek_work/dsh-plugins/aix-work/lib/index.js'],
                   capture_output=True, text=True)
    print(r.stdout[:3000])

# 3. 用 python 直接对比每行
import re
head = r.stdout  # 已经是 bytes
cur = open('E:/deepseek_work/dsh-plugins/aix-work/lib/index.js', 'rb').read()

# 行级对比
head_lines = head.decode('utf-8', errors='replace').split('\n')
cur_lines = cur.decode('utf-8', errors='replace').split('\n')
diffs = []
for i, (h, c) in enumerate(zip(head_lines, cur_lines)):
    if h != c:
        diffs.append((i + 1, h, c))

print(f'\n不同行数: {len(diffs)}')
for line_no, h, c in diffs[:10]:
    print(f'\n--- line {line_no} ---')
    print(f'  HEAD: {h[:120]!r}')
    print(f'  CURR: {c[:120]!r}')