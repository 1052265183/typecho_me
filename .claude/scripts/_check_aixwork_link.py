#!/usr/bin/env python3
"""检查 DSH 实际加载的 AIX-WORK 是 symlink/junction 还是普通文件"""
import os, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

AIX_PATH = r'C:\Users\huxu\.dsh\profiles\web\node_modules\@aix-work'

# 1. Python 读 link 信息
print('===== 1. Python os.path 读 link =====')
print(f'  islink: {os.path.islink(AIX_PATH)}')
if os.path.islink(AIX_PATH):
    print(f'  readlink: {os.readlink(AIX_PATH)}')

# 2. Windows fsutil 查 reparse point
print()
print('===== 2. Windows fsutil reparsepoint =====')
r = subprocess.run(['cmd', '/c', 'fsutil', 'reparsepoint', 'query', AIX_PATH],
                   capture_output=True)
out = (r.stdout or r.stderr).decode('gbk', errors='replace')
print(out)

# 3. dir 命令看 link 标识
print()
print('===== 3. dir 看属性 =====')
r = subprocess.run(['cmd', '/c', 'dir', '/AL', AIX_PATH],
                   capture_output=True)
out = (r.stdout or r.stderr).decode('gbk', errors='replace')
print(out[:1500])

# 4. 看 AIX-WORK 的 package.json 实际被读哪个
print()
print('===== 4. 两个目录的 package.json 内容 =====')
for p in [
    r'C:\Users\huxu\.dsh\profiles\web\node_modules\@aix-work\plugin\package.json',
    r'C:\Users\huxu\workspace\dsh_plugins_dev\aix-work-dev\plugin\package.json',
]:
    print(f'-- {p} --')
    try:
        text = open(p, 'r', encoding='utf-8').read()
        print(text[:500])
    except FileNotFoundError:
        print('  (不存在)')
    except Exception as e:
        print(f'  ERROR: {e}')

# 5. 读 AIX-WORK 实际加载位置 apply() 函数（看是否有 configSection）
print()
print('===== 5. DSH 实际加载的 AIX-WORK 是否含 configSection =====')
r = subprocess.run(['findstr', '/N', '/C:"configSection"', AIX_PATH + r'\plugin\lib\index.js'],
                   capture_output=True)
out = (r.stdout or r.stderr).decode('gbk', errors='replace')
print(out[:500])
if 'configSection' not in out:
    print('  ← 不含 configSection（baseline 版本）')