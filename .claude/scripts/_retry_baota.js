// 综合重试：3 个 URL × 多种 TLS 配置，看服务端是否放开
const https = require('https');
const fs = require('fs');

const URLS = [
    { label: 'WSL 内 IP', url: 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp' },
    { label: '证书 SAN 公网 IP', url: 'https://117.150.225.202:8765/bt-mcp-hcDq2niRl5HW/mcp' },
    { label: '证书 SAN 私有 IP', url: 'https://10.255.255.254:8765/bt-mcp-hcDq2niRl5HW/mcp' },
];
const TOKEN = 'btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4';
const CERT_PATH = 'C:\\Users\\huxu\\.claude\\baota_root_ca.crt';

const initBody = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {},
              clientInfo: { name: 'retry', version: '1.0' } }
});

let ca = null;
try { ca = fs.readFileSync(CERT_PATH); } catch (e) {}

function test(label, urlStr, opts) {
    return new Promise((resolve) => {
        const u = new URL(urlStr);
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
                console.log(`  HTTP ${res.statusCode} | server=${res.headers.server || '-'} | body=${data.slice(0, 200)}`);
                resolve({ ok: res.statusCode < 500, status: res.statusCode, body: data });
            });
        });
        req.on('error', (e) => {
            console.log(`  [ERROR] ${e.code}: ${e.message.slice(0, 150)}`);
            resolve({ ok: false, err: e.code });
        });
        req.setTimeout(8000, () => {
            console.log('  [TIMEOUT 8s]');
            req.destroy();
            resolve({ ok: false, err: 'TIMEOUT' });
        });
        req.write(initBody);
        req.end();
    });
}

(async () => {
    for (const { label, url } of URLS) {
        console.log(`\n========== ${label} (${url}) ==========`);
        console.log('-- 1. TLS 验证 + ca=baota_root_ca.crt --');
        await test(label, url, { ca, rejectUnauthorized: true });
        console.log('-- 2. rejectUnauthorized=false（跳过 TLS）--');
        await test(label, url, { rejectUnauthorized: false });
        console.log('-- 3. 不带 token（看服务端是否 ip_check 先于 auth）--');
        // 重写 token header 为空
        await test(label, url, { ca, rejectUnauthorized: true, headers: {} });
    }
    console.log('\n===== 重试完成 =====');
})();