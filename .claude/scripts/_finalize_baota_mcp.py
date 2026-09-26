#!/usr/bin/env python3
"""收尾：备份重命名 + 校验 .mcp.json + aix_work_diag 验证 DSH 识别"""
import json, os, shutil, sys, subprocess
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MCP_JSON = Path('C:/Users/huxu/AI/.mcp.json')
WRONG_BAK = Path('C:/Users/huxu/AI/.mcp.mcp.json.bak')
GOOD_BAK = Path('C:/Users/huxu/AI/.mcp.json.bak')

# 1. 重命名备份
print('===== 备份重命名 =====')
if WRONG_BAK.exists():
    if GOOD_BAK.exists():
        print(f'  {GOOD_BAK} 已存在，删除 {WRONG_BAK}')
        WRONG_BAK.unlink()
    else:
        shutil.move(str(WRONG_BAK), str(GOOD_BAK))
        print(f'  {WRONG_BAK} -> {GOOD_BAK}')
else:
    print(f'  无错误备份，跳过')

# 2. 读 .mcp.json 验证 baota-mcp 配置
print()
print('===== .mcp.json 内容校验 =====')
cfg = json.loads(MCP_JSON.read_text(encoding='utf-8'))
servers = cfg.get('mcpServers', {})
print(f'  mcpServers 数: {len(servers)}')
for name, body in servers.items():
    if name == 'baota-mcp':
        print(f'  [{name}] type={body.get("type")} url={body.get("url")}')
        print(f'    headers.Authorization: {body.get("headers", {}).get("Authorization", "")[:25]}...')
        print(f'    env.NODE_EXTRA_CA_CERTS: {body.get("env", {}).get("NODE_EXTRA_CA_CERTS")}')
    else:
        print(f'  [{name}] (stdio, 略)')

# 3. 跑 aix_work_diag 验证 DSH 是否识别
print()
print('===== DSH 识别情况（aix_work_diag mcp） =====')
# aix_work_diag 是 MCP 工具，要从 dsh shell 调用——这里不能直接调
# 用 subprocess 试探
print('  (DSH MCP 工具调用需在对话中由模型触发，这里仅做配置层验证)')