#!/usr/bin/env python3
"""初始化完成自检脚本：逐项跑规则末尾 checklist，输出 PASS/FAIL"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def ok(b):
    return "[X]" if b else "[ ]"

# ===== A. 14 项目录骨架检查 =====
print("===== A. 14 项目录骨架检查 =====")
checks = [
    ("CLAUDE.md", ROOT / "CLAUDE.md"),
    ("README.md", ROOT / "README.md"),
    (".claude/docs/", ROOT / ".claude/docs"),
    (".claude/plans/", ROOT / ".claude/plans"),
    (".claude/skills/", ROOT / ".claude/skills"),
    (".claude/scripts/", ROOT / ".claude/scripts"),
    (".claude/bugs/", ROOT / ".claude/bugs"),
    (".claude/tmp/", ROOT / ".claude/tmp"),
    (".claude/screenshots/", ROOT / ".claude/screenshots"),
    (".claude/ui-dumps/", ROOT / ".claude/ui-dumps"),
    (".claude/planning/01-需求分析/", ROOT / ".claude/planning/01-需求分析"),
    (".claude/planning/02-技术设计/", ROOT / ".claude/planning/02-技术设计"),
    (".claude/planning/03-任务拆解/", ROOT / ".claude/planning/03-任务拆解"),
    (".claude/planning/04-开发计划/", ROOT / ".claude/planning/04-开发计划"),
    (".claude/planning/05-参考资料/", ROOT / ".claude/planning/05-参考资料"),
]
for name, p in checks:
    print(f"  {ok(p.exists())} {name}")

# ===== B. 关键文件存在性 + 大小 =====
print()
print("===== B. 关键文件存在性 + 大小 =====")
key_files = [
    "CLAUDE.md",
    "README.md",
    ".claude/planning/README.md",
    ".claude/planning/glossary.md",
    ".claude/planning/02-技术设计/ADR-README.md",
    ".claude/planning/02-技术设计/架构图.md",
    ".claude/docs/typecho-DEVELOPER_RULES.md",
    ".claude/docs/typecho-GAPS.md",
]
for f in key_files:
    p = ROOT / f
    if p.exists():
        size = p.stat().st_size
        lines = len(p.read_text(encoding="utf-8").splitlines())
        print(f"  {ok(True)}  {f}  ({size} bytes, {lines} lines)")
    else:
        print(f"  {ok(False)}  {f}  MISSING")

# ===== C. CLAUDE.md 必含节 checklist =====
print()
print("===== C. CLAUDE.md 必含节 checklist =====")
claude = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
md_checks = [
    ("0. 项目概况", "## 0. 项目概况" in claude),
    ("§0 项目前缀/短名/驼峰三栏", "`typecho-`" in claude and "`typecho`" in claude and "`Typecho`" in claude),
    ("§0.1 项目文档与上下文（强制）", "## 0.1 项目文档与上下文（强制）" in claude),
    ("§0.2 文档索引", "## 0.2 文档索引" in claude),
    ("§0.3 分析问题禁止瞎猜（强制）", "## 0.3 分析问题禁止瞎猜（强制）" in claude),
    ("§0.4 当前已知缺口（强制）", "## 0.4 当前已知缺口（强制）" in claude),
    ("§1~N 具体代码规范", "## 1." in claude and "## 6." in claude),
    ("末尾 AI 协作约定", "AI 协作约定" in claude),
    ("末尾无硬编码全局规则路径", "~/.claude/rules/" not in claude and "C:\\Users\\huxu\\.claude" not in claude),
]
for name, isok in md_checks:
    print(f"  {ok(isok)} {name}")

# ===== D. DEVELOPER_RULES 三段 =====
print()
print("===== D. DEVELOPER_RULES 三段 =====")
dev = (ROOT / ".claude/docs/typecho-DEVELOPER_RULES.md").read_text(encoding="utf-8")
for name in ["模块依赖", "构建系统", "Git 规范"]:
    has_section = f"## {name}" in dev or f"### {name}" in dev
    no_placeholder = "（grilling 过程中补充）" not in dev
    print(f"  {ok(has_section and no_placeholder)} {name}")

# ===== E. GAPS 三段 =====
print()
print("===== E. GAPS 三段 =====")
gaps = (ROOT / ".claude/docs/typecho-GAPS.md").read_text(encoding="utf-8")
for name in ["代码缺口", "待办", "外部依赖阻塞"]:
    print(f"  {ok(name in gaps)} {name}")

# ===== F. 命名规范：docs/ 下 .md 以 typecho- 开头 =====
print()
print("===== F. 命名规范：docs/ 下 .md 以 typecho- 开头 =====")
docs_dir = ROOT / ".claude/docs"
for p in sorted(docs_dir.glob("*.md")):
    is_ok = p.name.startswith("typecho-")
    print(f"  {ok(is_ok)} {p.name}")

# ===== G. 模板无占位符检查 =====
print()
print("===== G. 模板无占位符检查 =====")
for f in [
    ".claude/planning/README.md",
    ".claude/planning/glossary.md",
    ".claude/planning/02-技术设计/ADR-README.md",
    ".claude/docs/typecho-DEVELOPER_RULES.md",
    ".claude/docs/typecho-GAPS.md",
]:
    text = (ROOT / f).read_text(encoding="utf-8")
    bad = []
    if "（grilling 过程中补充）" in text:
        bad.append("grilling 占位符")
    if "（无）" in text:
        bad.append("（无）占位符")
    status = "[X] OK" if not bad else f"[ ] FAIL: {bad}"
    print(f"  {ok(not bad)} {f}  {status}")

# ===== H. git 状态检查 =====
print()
print("===== H. git 状态检查（应未自动提交） =====")
r = subprocess.run(["git", "-C", str(ROOT), "status", "--short"], capture_output=True, text=True)
status_lines = [l for l in r.stdout.splitlines() if l.strip()]
print(f"  共 {len(status_lines)} 行变更（前 30 行）：")
for line in status_lines[:30]:
    print(f"    {line}")
if len(status_lines) > 30:
    print(f"    ... 共 {len(status_lines)} 行")