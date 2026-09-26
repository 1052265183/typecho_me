#!/usr/bin/env python3
"""把 configSection patch 应用到 E:/deepseek_work/dsh-plugins/aix-work/lib/index.js"""
import shutil, subprocess, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

TARGET = Path('E:/deepseek_work/dsh-plugins/aix-work/lib/index.js')
BACKUP = Path('E:/deepseek_work/dsh-plugins/aix-work/lib/index.js.bak.before-configSection')

# 1. 备份
print('===== 1. 备份原文件 =====')
if not TARGET.exists():
    print(f'  [FAIL] {TARGET} 不存在')
    sys.exit(1)
shutil.copy2(TARGET, BACKUP)
print(f'  [OK] {TARGET} -> {BACKUP}')

text = TARGET.read_text(encoding='utf-8')

# 2. 校验 baseline 锚点存在（防御性：避免错位编辑）
anchor1 = '"如果用户需求模糊（回答短、不完整、有歧义），**进入 grill-with-docs 流程**：用 `ask_user_question` 弹窗逐轮精化需求（每轮聚焦一个未明确的维度），直到设计树收敛再开始实施。\\n";\n    }\n    return "# AIX-WORK Repository Context'
anchor2 = '"- 项目文档: **" + docList.length + "** 个（路径见下）" + rootClaudeMdSection + "\\n" +\n      rulesBody +\n      openingSection;'

if anchor1 not in text:
    print(f'  [FAIL] anchor1 不在文件中（baseline 可能已变），请人工核对')
    sys.exit(1)
if anchor2 not in text:
    print(f'  [FAIL] anchor2 不在文件中（baseline 可能已变），请人工核对')
    sys.exit(1)

# 3. 应用第一处插入：openingSection 字符串结束 + } 之后，return 之前插入 configSection 定义
INSERT_DEFINITION = '''    // 配置源路径注入：让模型知道 MCP/Skill/Rule 的增删改入口在哪
    // （实测痛点：模型看到「MCP servers: N 个」却不知道 .mcp.json 在哪，无法帮用户加 MCP）
    // 路径全部按插件实际加载位置动态解析：_pluginRoot = import.meta.url 推导（dev junction /
    // 正式安装位置每台机器不同）；dshHome = DSH_HOME；面板路径来自运行时配置
    const cfg = state.config || {};
    const fmt = function(arr) { return (arr && arr.length) ? arr.join(", ") : "(未配置)"; };
    let configSection = "\\n## Config Sources (配置源 — 新增/修改 MCP、技能、规则改这里)\\n" +
      "- **插件加载位置**: `" + _pluginRoot + "`\\n" +
      "- **内置资源**（随包发布，同名时面板配置优先）: rules `" + assetsRulesDir + "` / skills `" + assetsSkillsDir + "` / plugins `" + assetsPluginsDir + "`\\n" +
      "- **插件配置文件**: `" + dshHome + "/aix-work-config.json`（mcpPaths/skillPaths/rulePaths 等路径配置存这里）\\n" +
      "- **MCP 配置文件**: `" + fmt(cfg.mcpPaths) + "`（新增/修改 MCP server → 编辑这些 .mcp.json，改完在设置面板点重新同步或重启）\\n" +
      "- **技能目录**: `" + fmt(cfg.skillPaths) + "`（新技能 = 子目录含 SKILL.md）\\n" +
      "- **规则目录**: `" + fmt(cfg.rulePaths) + "`（新规则 = .md 文件）\\n" +
      "- **插件缓存目录**: `" + fmt(cfg.pluginCachePaths) + "`\\n" +
      "- 全局规则文件 `" + dshHome + "/AGENTS.md` 由插件自动生成，勿手改\\n" +
      "- basePath: `" + (cfg.basePath || "(未配置)") + "`；路径也可在 DSH 设置面板 → AIX-WORK 交互修改\\n";
    return "# AIX-WORK Repository Context'''

old1 = '''    return "# AIX-WORK Repository Context'''
new1 = INSERT_DEFINITION + old1
new_text = text.replace(old1, new1, 1)
if new_text == text:
    print(f'  [FAIL] 第一处替换未生效')
    sys.exit(1)

# 4. 应用第二处插入：return 字符串里 + configSection
old2 = '''"- 项目文档: **" + docList.length + "** 个（路径见下）" + rootClaudeMdSection + "\\n" +
      rulesBody +
      openingSection;'''
new2 = '''"- 项目文档: **" + docList.length + "** 个（路径见下）" + rootClaudeMdSection + "\\n" +
      configSection +
      rulesBody +
      openingSection;'''
new_text2 = new_text.replace(old2, new2, 1)
if new_text2 == new_text:
    print(f'  [FAIL] 第二处替换未生效')
    sys.exit(1)

# 5. 写回
TARGET.write_text(new_text2, encoding='utf-8')
print()
print('===== 2. 写入完成 =====')
print(f'  文件: {TARGET}')
print(f'  大小: {TARGET.stat().st_size} bytes (原 {BACKUP.stat().st_size} bytes)')

# 6. 验证修改成功
print()
print('===== 3. 验证 =====')
text_after = TARGET.read_text(encoding='utf-8')
checks = [
    ('configSection 定义', 'let configSection = "\\n## Config Sources' in text_after),
    ('configSection 注入到 return', '      configSection +\\n      rulesBody +' in text_after),
    ('文件包含 cfg 引用', 'const cfg = state.config || {};' in text_after),
]
for name, ok in checks:
    print(f'  [{"X" if ok else " "}] {name}')

# 7. diff（看 vs baseline）
print()
print('===== 4. 对比 baseline vs 当前 =====')
if (Path('E:/deepseek_work/dsh-plugins/.git')).exists():
    r = subprocess.run(['git', '-C', 'E:/deepseek_work/dsh-plugins', 'diff', '--stat', 'aix-work/lib/index.js'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10)
    print(r.stdout)
    print('--- 详细 diff ---')
    r = subprocess.run(['git', '-C', 'E:/deepseek_work/dsh-plugins', 'diff', 'aix-work/lib/index.js'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10)
    print(r.stdout[:2000])
else:
    print('  (不是 git 仓库)')