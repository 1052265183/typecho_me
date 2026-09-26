// 单独精测 117.150.225.202：分阶段看 TCP / TLS / HTTP
const net = require('net');
const tls = require('tls');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const IP = '117.150.225.202';
const PORT = 8765;
const CERT_PATH = 'C:\\Users\\huxu\\.claude\\baota_root_ca.crt';

// 1. TCP 连通性
console.log('===== 1. TCP ' + IP + ':' + PORT + ' =====');
const sock = new net.Socket();
sock.setTimeout(5000);
sock.on('connect', () => {
    console.log('  [OK] TCP connected');
    sock.destroy();
});
sock.on('timeout', () => {
    console.log('  [TIMEOUT] 5s');
    sock.destroy();
});
sock.on('error', (e) => {
    console.log('  [ERROR] ' + e.code + ': ' + e.message);
});
sock.connect(PORT, IP);

// 2. 用 Windows tracert 看跳数（仅 Windows）
setTimeout(() => {
    console.log('\n===== 2. tracert ' + IP + ' (前 10 跳) =====');
    try {
        const out = execSync(`chcp 65001 > NUL & tracert -d -h 10 -w 2000 ${IP}`, {
            encoding: 'utf-8', timeout: 30000, shell: 'cmd.exe',
        });
        console.log(out.split('\n').slice(0, 25).join('\n'));
    } catch (e) {
        console.log('  [WARN] tracert 失败: ' + (e.message || e));
    }
}, 6000);

// 3. POST with TLS verification (using baota_root_ca.crt + SAN-matched IP)
setTimeout(() => {
    console.log('\n===== 3. POST initialize 到 ' + IP + '（带 ca 验证）=====');
    const ca = fs.readFileSync(CERT_PATH);
    const initBody = JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {},
                  clientInfo: { name: 'precise', version: '1.0' } }
    });
    const req = https.request({
        hostname: IP, port: PORT, path: '/bt-mcp-hcDq2niRl5HW/mcp',
        method: 'POST',
        headers: {
            'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Content-Length': Buffer.byteLength(initBody),
        },
        ca, rejectUnauthorized: true,
    }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            console.log('  HTTP ' + res.statusCode);
            console.log('  body: ' + data.slice(0, 300));
        });
    });
    req.on('error', (e) => {
        console.log('  [ERROR] ' + e.code + ': ' + e.message);
    });
    req.setTimeout(10000, () => { console.log('  [TIMEOUT 10s]'); req.destroy(); });
    req.write(initBody);
    req.end();
}, 8000);