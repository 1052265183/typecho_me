#!/usr/bin/env python3
"""验证 DSH 实际加载 skills 的路径"""
import os, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. 列出两个候选 skills 目录
print('===== 两个候选 skills 目录 =====')
for label, p in [
    ('~/.claude/skills', Path(os.path.expanduser('~/.claude/skills'))),
    ('~/AI/.claude/skills', Path(os.path.expanduser('~/AI/.claude/skills'))),
]:
    if p.exists():
        skills = sorted([d.name for d in p.iterdir() if d.is_dir()])
        print(f'  [{label}] {p}  存在, {len(skills)} 个 skill:')
        for s in skills:
            print(f'    - {s}')
    else:
        print(f'  [{label}] {p}  不存在')

# 2. 看 DSH 配置里是否有 skills 路径设置
print()
print('===== DSH/AI 配置中 skills 路径设置 =====')
for p in [
    Path(os.path.expanduser('~/.dsh/settings.yaml')),
    Path(os.path.expanduser('~/AI/.dsh/settings.yaml')),
    Path(os.path.expanduser('~/.dsh/aix-work-config.json')),
]:
    if p.exists():
        text = p.read_text(encoding='utf-8', errors='replace')
        # grep 包含 skills 的行
        for line in text.splitlines():
            if 'skill' in line.lower():
                print(f'  [{p}] {line}')