// 模拟 DSH 客户端（Node.js）的 MCP 连接行为：
// 1. 用 baota_root_ca.crt 信任链
// 2. POST initialize 请求
// 3. 看是 TLS 失败 还是 IP 白名单失败

const https = require('https');
const fs = require('fs');
const { URL } = require('url');

const URL_STR = 'https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp';
const TOKEN = 'btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4';
const CERT_PATH = 'C:\\Users\\huxu\\.claude\\baota_root_ca.crt';

const initBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'node-diag', version: '1.0' }
    }
});

const url = new URL(URL_STR);

function test(name, opts) {
    console.log('\n===== ' + name + ' =====');
    const req = https.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
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
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log('  HTTP ' + res.statusCode);
            console.log('  server: ' + res.headers.server);
            console.log('  content-type: ' + res.headers['content-type']);
            console.log('  body: ' + data.slice(0, 300));
        });
    });
    req.on('error', (e) => {
        console.log('  [ERROR] ' + e.code + ': ' + e.message);
        if (e.code === 'SELF_SIGNED_CERT_IN_CHAIN') console.log('    -> 系统 CA 不信任');
        if (e.code === 'CERT_HAS_EXPIRED') console.log('    -> 证书过期');
        if (e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') console.log('    -> 叶子证书签名无法验证');
        if (e.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') console.log('    -> 自签名根');
        if (e.code === 'ECONNRESET') console.log('    -> 连接被服务端重置');
    });
    req.write(initBody);
    req.end();
}

// 1. Node 默认 CA（系统信任库）
test('1. Node 默认 CA（系统信任库）', {});

// 2. 用 NODE_EXTRA_CA_CERTS（方式 C 等效）
process.env.NODE_EXTRA_CA_CERTS = CERT_PATH;
delete require.cache[require.resolve('https')];  // 重新加载 https 模块使 env 生效
test('2. NODE_EXTRA_CA_CERTS=baota_root_ca.crt', {});

// 3. ca 选项直接传证书（与方式 C 等效，但代码层）
try {
    const ca = fs.readFileSync(CERT_PATH);
    test('3. https 选项 ca=baota_root_ca.crt', { ca });
} catch (e) {
    console.log('  [SKIP] 证书文件读不到: ' + e.message);
}

// 4. rejectUnauthorized=false（方式 E 等效）
test('4. rejectUnauthorized=false（方式 E）', { rejectUnauthorized: false });

// 5. 用 openssl s_client 验证证书链（用 Node 不支持的方式，这里用 OpenSSL CLI）
setTimeout(() => {
    const { execSync } = require('child_process');
    try {
        console.log('\n===== 5. openssl s_client（验证服务端证书链）=====');
        const out = execSync(
            `openssl s_client -connect ${url.hostname}:${url.port} -servername ${url.hostname} -showcerts < NUL 2>&1`,
            { encoding: 'utf-8', timeout: 10 }
        );
        // 找 SAN
        const sanMatch = out.match(/Subject Alternative Name:[^\n]+/);
        if (sanMatch) console.log('  SAN: ' + sanMatch[0]);
        // 找 verify 返回码
        const verifyMatch = out.match(/Verify return code: (\d+) \((.+?)\)/);
        if (verifyMatch) console.log('  verify rc: ' + verifyMatch[1] + ' (' + verifyMatch[2] + ')');
        // 找 issuer 链
        const issuers = out.match(/issuer=[^\n]+/g);
        if (issuers) {
            console.log('  issuer chain:');
            issuers.forEach(i => console.log('    ' + i));
        }
    } catch (e) {
        console.log('  [WARN] openssl 调用失败: ' + e.message);
    }
}, 500);