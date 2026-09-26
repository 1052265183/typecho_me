#!/usr/bin/env python3
"""验证 setx 写入 + 检查注册表 + 给用户重启 DSH 的明确步骤"""
import os, subprocess, sys, winreg
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. 读 HKCU\Environment 看是否写入
print('===== 1. 注册表 HKCU\\Environment =====')
try:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Environment') as key:
        try:
            value, _ = winreg.QueryValueEx(key, 'NODE_TLS_REJECT_UNAUTHORIZED')
            print(f'  [OK] NODE_TLS_REJECT_UNAUTHORIZED = {value!r}')
        except FileNotFoundError:
            print(f'  [FAIL] NODE_TLS_REJECT_UNAUTHORIZED 不在注册表中')
except Exception as e:
    print(f'  [ERROR] 读注册表失败: {e}')

# 2. 当前进程能不能拿到（新 setx 对当前进程无效，预期是没有）
print()
print('===== 2. 当前进程 env（预期没有，因为 setx 对当前进程不生效）=====')
print(f'  os.environ.get("NODE_TLS_REJECT_UNAUTHORIZED"): {os.environ.get("NODE_TLS_REJECT_UNAUTHORIZED")!r}')

# 3. 启动一个全新的 cmd 子进程，看它能否拿到
print()
print('===== 3. 新开 cmd 子进程（模拟用户重启 DSH）=====')
r = subprocess.run(['cmd', '/c', 'echo NODE_TLS_REJECT_UNAUTHORIZED=%NODE_TLS_REJECT_UNAUTHORIZED%'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
print(f'  新 cmd 输出: {r.stdout.strip()}')

# 4. 顺便也设 NODE_EXTRA_CA_CERTS（更稳的双保险）
print()
print('===== 4. 同时设 NODE_EXTRA_CA_CERTS（双保险）=====')
r = subprocess.run(['cmd', '/c', 'setx', 'NODE_EXTRA_CA_CERTS', r'C:\Users\huxu\.claude\baota_root_ca.crt'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
print(f'  setx exit: {r.returncode}, stdout: {r.stdout.strip()}')

# 5. 验证两个 env 都写入了
print()
print('===== 5. 最终验证 =====')
with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Environment') as key:
    for name in ['NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS']:
        try:
            value, _ = winreg.QueryValueEx(key, name)
            print(f'  [OK] {name} = {value!r}')
        except FileNotFoundError:
            print(f'  [FAIL] {name} 未找到')