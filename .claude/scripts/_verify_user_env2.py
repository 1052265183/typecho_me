#!/usr/bin/env python3
"""直接读 Windows 注册表验证 env 写入（不依赖 cmd/PowerShell 进程环境）"""
import os, sys, winreg
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

print('===== 直接从 HKCU\\Environment 读（权威）=====')
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

for name in ['NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'PATH', 'TEMP']:
    print(f'  {name}: {env.get(name, "(未找到)")}')

# 测试方法：让 Python 直接用 os.environ 配合 subprocess 传 env 进去
print()
print('===== 用 Python 显式传 env 给新 cmd（模拟 Explorer 启动 cmd 时的行为）=====')
import subprocess
custom_env = os.environ.copy()  # 当前 Python 的 env
custom_env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'  # 模拟 Explorer 已加载这个值
custom_env['NODE_EXTRA_CA_CERTS'] = r'C:\Users\huxu\.claude\baota_root_ca.crt'

# 启动 cmd echo 看变量
r = subprocess.run(['cmd', '/c', 'echo %NODE_TLS_REJECT_UNAUTHORIZED%'],
                   capture_output=True, text=True, encoding='gbk', errors='replace', env=custom_env)
print(f'  cmd echo: {r.stdout.strip()!r}')

# 启动 Node 测试 MCP 连接（模拟 DSH 子进程）
print()
print('===== Node https with NODE_TLS_REJECT_UNAUTHORIZED=0 env =====')
node_test = '''
const https = require('https');
const r = https.request({
    hostname: '172.29.51.111', port: 8765, path: '/bt-mcp-hcDq2niRl5HW/mcp',
    method: 'POST',
    headers: {
        'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
        'Content-Type': 'application/json',
    },
    rejectUnauthorized: false,
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log('HTTP ' + res.statusCode + ' body=' + data.slice(0, 100));
    });
});
r.on('error', (e) => console.log('ERROR ' + e.code + ': ' + e.message.slice(0, 100)));
r.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'final',version:'1'}}}));
r.end();
'''
r = subprocess.run(['node', '-e', node_test],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', env=custom_env, timeout=15)
print(f'  Node 输出: {r.stdout.strip()}')
if r.stderr: print(f'  stderr: {r.stderr.strip()[:200]}')