#!/usr/bin/env python3
"""清理错误位置的 BT-* 技能 + 验证 DSH 加载"""
import os, shutil, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WRONG = Path(os.path.expanduser('~/.claude/skills'))
RIGHT = Path(os.path.expanduser('~/AI/.claude/skills'))

BT_NAMES = [
    'BT-Go-Project-Deploy',
    'BT-Html-Project-Deploy',
    'BT-Java-Project-Deploy',
    'BT-Node-Project-Deploy',
    'BT-Python-Project-Deploy',
    'BT-Reverse-Proxy',
    'BT-Website-Troubleshoot',
]

# 1. 删除错误位置的 BT-*
print('===== 清理错误位置 C:\\Users\\huxu\\.claude\\skills 的 BT-* =====')
for name in BT_NAMES:
    p = WRONG / name
    if p.exists():
        shutil.rmtree(p)
        print(f'  [DEL] {p}')
    else:
        print(f'  [SKIP] {name} 不存在')

# 2. 验证正确位置 BT-* 完整性（每个应该有 SKILL.md）
print()
print('===== 验证正确位置 BT-* 完整性 =====')
for name in BT_NAMES:
    p = RIGHT / name
    skill_md = p / 'SKILL.md'
    if skill_md.exists():
        size = skill_md.stat().st_size
        print(f'  [X] {name}/SKILL.md  ({size} bytes)')
    else:
        print(f'  [ ] {name}/SKILL.md  MISSING')

# 3. 对比两个目录
print()
print('===== 两个目录最终对比 =====')
print(f'  错误位置 {WRONG}:')
for d in sorted(WRONG.iterdir()):
    if d.is_dir():
        print(f'    - {d.name}')
print(f'  正确位置 {RIGHT}:')
for d in sorted(RIGHT.iterdir()):
    if d.is_dir():
        print(f'    - {d.name}')