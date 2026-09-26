// 验证两个假设：
// A. NODE_TLS_REJECT_UNAUTHORIZED 环境变量是否影响 https.request 的 hostname 校验
// B. NODE_EXTRA_CA_CERTS 是否能修复 SAN mismatch
const https = require('https');
const fs = require('fs');

const URL_STR = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp';
const TOKEN = 'btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4';
const CERT_PATH = 'C:\\Users\\huxu\\.claude\\baota_root_ca.crt';

const initBody = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {},
              clientInfo: { name: 'env-test', version: '1.0' } }
});

function test(label, opts, envVars) {
    console.log('\n===== ' + label + ' =====');
    if (envVars) {
        for (const [k, v] of Object.entries(envVars)) process.env[k] = v;
    }
    const u = new URL(URL_STR);
    const req = https.request({
        hostname: u.hostname, port: u.port, path: u.pathname,
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + TOKEN,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Content-Length': Buffer.byteLength(initBody),
        },
        ...opts,
    }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            console.log('  HTTP ' + res.statusCode);
            console.log('  body: ' + data.slice(0, 200));
        });
    });
    req.on('error', (e) => {
        console.log('  [ERROR] ' + e.code + ': ' + e.message.slice(0, 200));
    });
    req.setTimeout(8000, () => { console.log('  [TIMEOUT]'); req.destroy(); });
    req.write(initBody);
    req.end();
}

// A. 不设 env（基线）
test('A. 基线（无 env, 无 ca）');

// B. NODE_TLS_REJECT_UNAUTHORIZED=0 env
setTimeout(() => test('B. env NODE_TLS_REJECT_UNAUTHORIZED=0',
    {},
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), 500);

// C. NODE_TLS_REJECT_UNAUTHORIZED=0 + NODE_EXTRA_CA_CERTS
setTimeout(() => test('C. env NODE_TLS_REJECT_UNAUTHORIZED=0 + NODE_EXTRA_CA_CERTS=baota_root_ca.crt',
    {},
    { NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_EXTRA_CA_CERTS: CERT_PATH }), 1500);

// D. 代码层 rejectUnauthorized=false（基线对照）
setTimeout(() => test('D. 代码层 rejectUnauthorized=false', { rejectUnauthorized: false }), 2500);

// E. 代码层 rejectUnauthorized=false + ca（最完整信任）
setTimeout(() => {
    try {
        const ca = fs.readFileSync(CERT_PATH);
        test('E. 代码层 rejectUnauthorized=false + ca', { rejectUnauthorized: false, ca });
    } catch (e) { console.log('  [SKIP] ca 读不到'); }
}, 3500);