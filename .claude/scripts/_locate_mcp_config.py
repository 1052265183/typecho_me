#!/usr/bin/env python3
"""定位现有 MCP 配置位置 + 读完整的 mcp_self_config.md（之前被截断的 PEM）"""
import os, subprocess, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(cmd, timeout=20):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=timeout,
    )

# 1. 看 ~/.claude 目录
print('===== ~/.claude 目录 =====')
claude_dir = Path(os.path.expanduser('~/.claude'))
if claude_dir.exists():
    for p in sorted(claude_dir.rglob('*'))[:50]:
        if p.is_file():
            print(f'  {p}')
else:
    print('  ~/.claude 不存在')

# 2. 看 ~/.dsh 目录（DSH 配置根）
print()
print('===== ~/.dsh 目录 =====')
dsh_dir = Path(os.path.expanduser('~/.dsh'))
if dsh_dir.exists():
    # 只列顶层 + profiles
    for p in sorted(dsh_dir.iterdir())[:30]:
        print(f'  {p}')
    profiles = dsh_dir / 'profiles'
    if profiles.exists():
        for prof in profiles.iterdir():
            print(f'  profiles/{prof.name}/')
            for p in sorted(prof.iterdir())[:20]:
                print(f'    {p.name}')
else:
    print('  ~/.dsh 不存在')

# 3. 看 ~/.config/claude-code
print()
print('===== ~/.config/claude-code =====')
cc_dir = Path(os.path.expanduser('~/.config/claude-code'))
if cc_dir.exists():
    for p in cc_dir.rglob('*')[:30]:
        if p.is_file():
            print(f'  {p}')
else:
    print('  不存在')

# 4. 完整读取被截断的 mcp_self_config.md
print()
print('===== 完整 mcp_info.json（从 mcp_self_config.md 解析） =====')
import json, re
md_path = Path('C:/Users/huxu/Downloads/mcp_self_config.md')
text = md_path.read_text(encoding='utf-8')
# 找 ```json { ... } ``` 块
m = re.search(r'```json\s*(\{.*?\})\s*```', text, re.DOTALL)
if m:
    try:
        info = json.loads(m.group(1))
        print('解析成功，字段：')
        for k, v in info.items():
            if k == 'tls_cert':
                # 数下证书数量
                certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', v, re.DOTALL)
                print(f'  {k}: 包含 {len(certs)} 张证书，每张字符数={[len(c) for c in certs]}')
            else:
                print(f'  {k}: {v}')
    except Exception as e:
        print(f'解析失败: {e}')
else:
    print('未找到 ```json 块')