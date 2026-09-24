#!/usr/bin/env python3
"""初始化 AI 项目骨架：创建 .claude/ 12 项目录 + planning 5 子目录 + 占位 .gitkeep"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # 项目根（脚本在 .claude/scripts/）

DIRS = [
    # .claude 8 个一级目录
    ".claude/docs",
    ".claude/plans",
    ".claude/skills",
    ".claude/scripts",
    ".claude/bugs",
    ".claude/tmp",
    ".claude/screenshots",
    ".claude/ui-dumps",
    # .claude/planning 5 个子目录
    ".claude/planning/01-需求分析",
    ".claude/planning/02-技术设计",
    ".claude/planning/03-任务拆解",
    ".claude/planning/04-开发计划",
    ".claude/planning/05-参考资料",
]

for rel in DIRS:
    p = ROOT / rel
    p.mkdir(parents=True, exist_ok=True)
    keep = p / ".gitkeep"
    if not keep.exists():
        keep.touch()
        print(f"创建 {rel}/.gitkeep")
    else:
        print(f"已存在 {rel}/.gitkeep")

print("\n14 项目录骨架就绪。")