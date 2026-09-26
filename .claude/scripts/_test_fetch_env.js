// 验证 fetch (undici) 是否读 NODE_TLS_REJECT_UNAUTHORIZED env
// Node 22 内置 fetch = undici，行为可能与 https 模块不同
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_EXTRA_CA_CERTS = 'C:\\Users\\huxu\\.claude\\baota_root_ca.crt';

console.log('===== Node fetch 测试 =====');
console.log('env.NODE_TLS_REJECT_UNAUTHORIZED =', JSON.stringify(process.env.NODE_TLS_REJECT_UNAUTHORIZED));
console.log('env.NODE_EXTRA_CA_CERTS =', JSON.stringify(process.env.NODE_EXTRA_CA_CERTS));

(async () => {
    try {
        const r = await fetch('https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer btmcp_EtV2exSbJQUlCe7yBK81EsfxF2OszJVWxkeZbp81uq4',
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: { protocolVersion: '2024-11-05', capabilities: {},
                          clientInfo: { name: 'fetch-test', version: '1.0' } }
            }),
        });
        console.log('HTTP', r.status);
        const text = await r.text();
        console.log('body:', text.slice(0, 300));
    } catch (e) {
        console.log('[ERROR]', e.message || e);
        console.log('cause:', e.cause);
    }
})();