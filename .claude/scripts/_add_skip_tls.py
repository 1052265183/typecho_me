#!/usr/bin/env python3
"""在 .mcp.json 的 baota-mcp 条目里加 NODE_TLS_REJECT_UNAUTHORIZED=0（方式 E 跳过 TLS 验证）"""
import json, shutil, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MCP_JSON = Path('C:/Users/huxu/AI/.mcp.json')
BACKUP = Path('C:/Users/huxu/AI/.mcp.json.bak2')

# 备份当前（含 NODE_EXTRA_CA_CERTS）
if MCP_JSON.exists():
    shutil.copy2(MCP_JSON, BACKUP)
    print(f'备份: {BACKUP}')

cfg = json.loads(MCP_JSON.read_text(encoding='utf-8'))

if 'baota-mcp' not in cfg.get('mcpServers', {}):
    print('baota-mcp 不存在，跳过')
    sys.exit(1)

# 在 env 里同时保留 NODE_EXTRA_CA_CERTS + 加 NODE_TLS_REJECT_UNAUTHORIZED
bm = cfg['mcpServers']['baota-mcp']
bm.setdefault('env', {})
# 同时设置两个 env（CA 信任 + 跳过 hostname 验证）
bm['env']['NODE_EXTRA_CA_CERTS'] = r'C:\Users\huxu\.claude\baota_root_ca.crt'
bm['env']['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

with open(MCP_JSON, 'w', encoding='utf-8') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)

print()
print('===== 新 baota-mcp 配置 =====')
print(json.dumps(bm, indent=2, ensure_ascii=False))
print()
print(f'文件: {MCP_JSON}')