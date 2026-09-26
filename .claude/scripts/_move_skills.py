#!/usr/bin/env python3
"""把 BT-* 技能从 ~/.claude/skills 移到 ~/AI/.claude/skills"""
import os, shutil, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WRONG = Path(os.path.expanduser('~/.claude/skills'))   # C:\Users\huxu\.claude\skills
RIGHT = Path(os.path.expanduser('~/AI/.claude/skills'))  # C:\Users\huxu\AI\.claude\skills

BT_NAMES = [
    'BT-Go-Project-Deploy',
    'BT-Html-Project-Deploy',
    'BT-Java-Project-Deploy',
    'BT-Node-Project-Deploy',
    'BT-Python-Project-Deploy',
    'BT-Reverse-Proxy',
    'BT-Website-Troubleshoot',
]

# 1. 看现状
print('===== 现状 =====')
print(f'  错误位置 {WRONG}:')
if WRONG.exists():
    for d in sorted(WRONG.iterdir()):
        if d.is_dir():
            print(f'    - {d.name}')
print(f'  正确位置 {RIGHT}:')
if RIGHT.exists():
    for d in sorted(RIGHT.iterdir()):
        if d.is_dir():
            print(f'    - {d.name}')
else:
    print('    (不存在)')

# 2. 移动
print()
print('===== 移动 BT-* =====')
RIGHT.mkdir(parents=True, exist_ok=True)
for name in BT_NAMES:
    src = WRONG / name
    dst = RIGHT / name
    if not src.exists():
        print(f'  [SKIP] {name} 不在错误位置')
        continue
    if dst.exists():
        print(f'  [SKIP] {name} 已存在于正确位置')
        continue
    shutil.move(str(src), str(dst))
    print(f'  [MOVE] {src.name} -> {RIGHT}')

# 3. 验证
print()
print('===== 验证 =====')
bt_count = sum(1 for n in BT_NAMES if (RIGHT / n).exists())
print(f'  正确位置 BT-* 命中: {bt_count}/{len(BT_NAMES)}')
print(f'  错误位置剩余: {sorted(d.name for d in WRONG.iterdir() if d.is_dir() and d.name.startswith("BT-"))}')
print(f'  正确位置总 skill 数: {sum(1 for d in RIGHT.iterdir() if d.is_dir())}')