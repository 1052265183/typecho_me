#!/usr/bin/env python3
"""用 difflib 看用户本地修改 vs git HEAD"""
import subprocess, difflib, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

r = subprocess.run(['git', '-C', 'E:/deepseek_work/dsh-plugins', 'show', 'HEAD:aix-work/lib/index.js'],
                   capture_output=True)
head_text = r.stdout.decode('utf-8', errors='replace')

with open(r'E:\deepseek_work\dsh-plugins\aix-work\lib\index.js', 'r', encoding='utf-8') as f:
    cur_text = f.read()

head_lines = head_text.splitlines(keepends=True)
cur_lines = cur_text.splitlines(keepends=True)

print(f'HEAD lines: {len(head_lines)}')
print(f'当前 lines: {len(cur_lines)}')

# 看 line 200-250 的完整 diff
print()
print('=== line 200-260 diff ===')
for line in difflib.unified_diff(head_lines[199:260], cur_lines[199:260], lineterm='', n=3):
    print(line, end='')

# 也看整体 diff 摘要
diff = list(difflib.unified_diff(head_lines, cur_lines, lineterm='', n=1))
print()
print(f'总 diff 行数: {len(diff)}')
if len(diff) < 200:
    for line in diff:
        print(line, end='')