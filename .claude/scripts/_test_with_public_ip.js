// 用证书 SAN 中的真实 IP（117.150.225.202）测试是否 TLS + IP 白名单都通过
const https = require('https');
const fs = require('fs');

const URLS = [
    'https://117.150.225.202:8765/bt-mcp-hcDq2niRl5HW/mcp',  // 证书 SAN 中的公网 IP
    'https://10.255.255.254:8765/bt-mcp-hcDq2niRl5HW/mcp',    // SAN 中的私有 IP
];
const TOKEN = 'btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4';
const CERT_PATH = 'C:\\Users\\huxu\\.claude\\baota_root_ca.crt';

const initBody = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {},
              clientInfo: { name: 'node-diag-2', version: '1.0' } }
});

const ca = fs.readFileSync(CERT_PATH);

function test(name, urlStr) {
    console.log('\n===== ' + name + ' =====');
    console.log('  url: ' + urlStr);
    const u = new URL(urlStr);
    const req = https.request({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + TOKEN,
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
            console.log('  server: ' + res.headers.server);
            console.log('  body: ' + data.slice(0, 500));
        });
    });
    req.on('error', (e) => {
        console.log('  [ERROR] ' + e.code + ': ' + e.message);
        if (e.code === 'ECONNREFUSED') console.log('    -> 端口未开 / 防火墙拒');
        if (e.code === 'ETIMEDOUT') console.log('    -> 连接超时');
        if (e.code === 'ENOTFOUND') console.log('    -> DNS 解析失败');
        if (e.code === 'EHOSTUNREACH') console.log('    -> 主机不可达');
        if (e.code === 'SELF_SIGNED_CERT_IN_CHAIN') console.log('    -> 系统 CA 不信任');
        if (e.code === 'ERR_TLS_CERT_ALTNAME_INVALID') console.log('    -> SAN 不匹配');
    });
    req.setTimeout(8000, () => {
        console.log('  [TIMEOUT 8s]');
        req.destroy();
    });
    req.write(initBody);
    req.end();
}

test('1. 公网 IP 117.150.225.202', URLS[0]);
setTimeout(() => test('2. 私有 IP 10.255.255.254', URLS[1]), 500);