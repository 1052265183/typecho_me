#!/usr/bin/env python3
"""检查 dsh-plugins 是否 submodule + aix-work 是否独立 git 仓库"""
import subprocess, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')

# 1. dsh-plugins/.gitmodules
print('===== 1. .gitmodules =====')
p = 'E:/deepseek_work/dsh-plugins/.gitmodules'
if os.path.exists(p):
    print(open(p, 'r', encoding='utf-8').read())
else:
    print('  (不存在)')

# 2. dsh-plugins/aix-work/.git（独立 git 仓库？）
print()
print('===== 2. aix-work/.git =====')
p = 'E:/deepseek_work/dsh-plugins/aix-work/.git'
if os.path.exists(p):
    print('  aix-work 是独立 git 仓库（有 .git）')
    if os.path.isdir(p):
        items = os.listdir(p)
        print(f'  .git 内容前 5: {items[:5]}')
else:
    print('  aix-work 不是独立 git 仓库')

# 3. aix-work/.gitignore
print()
print('===== 3. aix-work/.gitignore =====')
p = 'E:/deepseek_work/dsh-plugins/aix-work/.gitignore'
if os.path.exists(p):
    print(open(p, 'r', encoding='utf-8').read())
else:
    print('  (不存在)')

# 4. dsh-plugins 自己的 .gitignore
print()
print('===== 4. dsh-plugins/.gitignore =====')
p = 'E:/deepseek_work/dsh-plugins/.gitignore'
if os.path.exists(p):
    text = open(p, 'r', encoding='utf-8').read()
    print(text[:1000])
else:
    print('  (不存在)')

# 5. 单独查 aix-work 是否 git 仓库
print()
print('===== 5. 在 aix-work 内跑 git status =====')
r = run(['git', '-C', 'E:/deepseek_work/dsh-plugins/aix-work', 'status', '--short'])
print(f'  git status (aix-work): {r.stdout!r}')
print(f'  stderr: {r.stderr!r}')

# 6. 当前文件 vs HEAD（aix-work 自身 HEAD）
print()
print('===== 6. aix-work 自身 git 状态 =====')
r = run(['git', '-C', 'E:/deepseek_work/dsh-plugins/aix-work', 'log', '--oneline', '-5'])
print(f'  log: {r.stdout}')
r = run(['git', '-C', 'E:/deepseek_work/dsh-plugins/aix-work', 'diff', '--stat', 'lib/index.js'])
print(f'  diff stat: {r.stdout!r}')
r = run(['git', '-C', 'E:/deepseek_work/dsh-plugins/aix-work', 'cat-file', '-s', 'HEAD:lib/index.js'])
print(f'  HEAD bytes: {r.stdout.strip()}')

# 7. aix-work/.claude/tmp/2.patch 内容
print()
print('===== 7. aix-work/.claude/tmp/2.patch（前 500）=====')
p = 'E:/deepseek_work/dsh-plugins/aix-work/.claude/tmp/2.patch'
if os.path.exists(p):
    print(open(p, 'r', encoding='utf-8').read()[:500])