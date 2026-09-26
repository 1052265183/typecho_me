#!/usr/bin/env python3
"""精确验证：让新 cmd 读 HKCU\Environment + 启动 PowerShell 测试"""
import os, subprocess, sys, winreg
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. 模拟用户"新开 cmd 后敲 echo %NODE_TLS_REJECT_UNAUTHORIZED%"
# 用 set 命令看变量是否对 cmd 可见
print('===== 1. cmd 内 set 命令（看 NODE_TLS 是否被 cmd 自动加载）=====')
r = subprocess.run(['cmd', '/c', 'set NODE_TLS_REJECT_UNAUTHORIZED'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
print(f'  cmd set 输出: {r.stdout.strip()!r}')

# 2. 用 cmd 直接调 echo %VAR%（看 cmd 是否展开）
print()
print('===== 2. cmd echo %VAR%（cmd 应该自动展开）=====')
r = subprocess.run(['cmd', '/c', 'echo %NODE_TLS_REJECT_UNAUTHORIZED%'],
                   capture_output=True, text=True, encoding='gbk', errors='replace')
print(f'  GBK 解码: {r.stdout.strip()!r}')
print(f'  原始 stdout: {r.stdout!r}')

# 3. 用 Python 直接读 HKCU\Environment（绕开 cmd）
print()
print('===== 3. Python 直接读 HKCU\\Environment（权威）=====')
env = {}
with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Environment') as key:
    i = 0
    while True:
        try:
            name, value, _ = winreg.EnumValue(key, i)
            env[name] = value
            i += 1
        except OSError:
            break

for name in ['NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS']:
    print(f'  {name}: {env.get(name, "(未找到)")!r}')

# 4. 用 PowerShell 启动子进程，看 PowerShell 是否展开
print()
print('===== 4. PowerShell $env:NODE_TLS_REJECT_UNAUTHORIZED =====')
r = subprocess.run(['powershell', '-NoProfile', '-Command', '$env:NODE_TLS_REJECT_UNAUTHORIZED'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
print(f'  PowerShell 输出: {r.stdout.strip()!r}')