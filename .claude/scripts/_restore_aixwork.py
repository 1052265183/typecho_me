#!/usr/bin/env python3
"""从备份恢复 AIX-WORK baseline（撤回刚才的坏 patch）"""
import shutil, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BACKUP = r'E:\deepseek_work\dsh-plugins\aix-work\lib\index.js.bak.before-configSection'
TARGET = r'E:\deepseek_work\dsh-plugins\aix-work\lib\index.js'

shutil.copy2(BACKUP, TARGET)
print(f'已恢复: {BACKUP} -> {TARGET}')

with open(TARGET, 'r', encoding='utf-8') as f:
    text = f.read()
print(f'文件大小: {len(text)} 字节')
print(f'含 configSection: {"let configSection" in text}')
print(f'含双 return 残留: {text.count(chr(34) + "# AIX-WORK Repository Context")} 次')