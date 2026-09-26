#!/usr/bin/env python3
"""第 4 步：把 baota-mcp 加到 C:/Users/huxu/AI/.mcp.json
   第 5 步：下载宝塔 skills ZIP 并解压到 ~/.claude/skills"""
import json, urllib.request, zipfile, shutil, os, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MCP_JSON = Path('C:/Users/huxu/AI/.mcp.json')
SKILLS_DIR = Path(os.path.expanduser('~/.claude/skills'))
CERT_PATH = r'C:\Users\huxu\.claude\baota_root_ca.crt'
ZIP_TMP = Path(os.path.expanduser('~/.claude/skills/_bt_skills.zip'))
SKILLS_ZIP_URL = 'http://download.bt.cn/bt_mcp_install/bt-skills.zip'

# ===== 第 4 步：写入 .mcp.json =====
print('===== 第 4 步：写入 baota-mcp 到 .mcp.json =====')

# 先备份
if MCP_JSON.exists():
    backup = MCP_JSON.with_suffix('.mcp.json.bak')
    shutil.copy2(MCP_JSON, backup)
    print(f'  备份: {backup}')

with open(MCP_JSON, 'r', encoding='utf-8') as f:
    cfg = json.load(f)

# 检查是否已存在 baota-mcp（避免重复）
if 'baota-mcp' in cfg.get('mcpServers', {}):
    print('  baota-mcp 已存在，跳过写入')
else:
    cfg.setdefault('mcpServers', {})
    cfg['mcpServers']['baota-mcp'] = {
        'type': 'http',
        'url': 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp',
        'headers': {
            'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4'
        },
        'env': {
            'NODE_EXTRA_CA_CERTS': CERT_PATH
        }
    }
    with open(MCP_JSON, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    print(f'  写入成功: {MCP_JSON}')
    print(f'  当前 mcpServers: {list(cfg["mcpServers"].keys())}')

# ===== 第 5 步：下载 skills =====
print()
print('===== 第 5 步：下载宝塔 skills ZIP =====')
SKILLS_DIR.mkdir(parents=True, exist_ok=True)

try:
    print(f'  下载: {SKILLS_ZIP_URL}')
    urllib.request.urlretrieve(SKILLS_ZIP_URL, ZIP_TMP)
    print(f'  下载完成: {ZIP_TMP} ({ZIP_TMP.stat().st_size} bytes)')

    # 解压（按指令的特殊处理：取顶层目录作为 skill 名）
    print(f'  解压到: {SKILLS_DIR}')
    with zipfile.ZipFile(ZIP_TMP) as zf:
        for member in zf.namelist():
            parts = member.split('/')
            if len(parts) >= 2 and parts[0] and not member.endswith('/'):
                target_dir = SKILLS_DIR / parts[0]
                target_dir.mkdir(parents=True, exist_ok=True)
                target_file = target_dir / '/'.join(parts[1:])
                if target_file != target_dir:  # 跳过目录本身
                    target_file.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as src, open(target_file, 'wb') as dst:
                        dst.write(src.read())

    ZIP_TMP.unlink()
    print(f'  ZIP 已删除: {ZIP_TMP}')

    # 列出 skills 目录
    skills = [d.name for d in SKILLS_DIR.iterdir() if d.is_dir()]
    print(f'  当前 skills 目录: {skills}')

except Exception as e:
    print(f'  下载失败: {type(e).__name__}: {e}')

# ===== 验证 =====
print()
print('===== 验证 =====')
print(f'  .mcp.json: {MCP_JSON.exists()}, 大小: {MCP_JSON.stat().st_size if MCP_JSON.exists() else 0}')
print(f'  skills 目录: {SKILLS_DIR} ({len([d for d in SKILLS_DIR.iterdir() if d.is_dir()])} 个 skill)')