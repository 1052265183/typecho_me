# Typecho 项目里给 baota MCP 配置 AI 客户端的完整经验

## 背景

在 DSH（DeepSeek Harness，包装 Claude Code 的桌面/Web AI 客户端）里，给 typecho 项目
新增 baota MCP server（基于 FastMCP 1.28.1，自签证书）。DSH 用两层 MCP 客户端：

1. **AIX-WORK 插件**（自实现的 curl HTTP 客户端）
2. **DSH 原生 MCP client**（`@deepseek-ai/dsh-mcp-client`，用 Node StreamableHTTPClientTransport）

两层并存，配置需要分别适配。

## 最终可用配置

`C:\Users\huxu\AI\.mcp.json`（DSH basePath 下）的 `baota-mcp` 条目：

```json
{
  "baota-mcp": {
    "type": "http",
    "url": "https://172.29.51.111:8765/bt-mcp-hcDq2niRl5HW/mcp",
    "headers": {
      "Authorization": "Bearer btmcp_<token>"   // 脱敏，按 mcp_info.json 填
    },
    "env": {
      "NODE_EXTRA_CA_CERTS": "C:\\Users\\huxu\\.claude\\baota_root_ca.crt",
      "NODE_TLS_REJECT_UNAUTHORIZED": "0"
    }
  }
}
```

注册表（HKCU\Environment）也写入同名两个 env，作为系统级备份（DSH 主进程继承）。
证书文件 `baota_root_ca.crt` 含 3 张证书链（1821+1869+1878 字符），由用户机器预置，
与 `mcp_info.json` 的 `tls_cert` 字段完全一致。

## 47 个可用工具

tools/list 返回（fastmcp 服务端定义）：

| 类别 | 工具 |
|---|---|
| 文件操作 | Read / Edit / Write / Glob / Grep / LS / WebFetch |
| 站点管理 | SiteList / SiteGetConfig / SiteLogs / SiteTraffic / TrafficAnalysis / SiteCertList |
| 数据库 | DatabaseList / MysqlQuery / MysqlExecute |
| 服务器 | ServerIP / ServiceStatus / Bash / BashStatus |
| Docker | ContainerList / ContainerLogs / ContainerInspect / ComposeList / ImageList / VolumeList / NetworkList |
| 系统 | SystemInfo / SoftwareList |
| 防火墙 | FirewallStatus / FirewallPortList / FirewallIpList / FirewallPortSet / FirewallIpSet |
| 项目环境 | JavaProjectInfo / NodeProjectInfo / PythonProjectInfo / GoProjectInfo / ProxyProjectInfo / HtmlProjectInfo |
| SSH / 安全 | SSHInfo / SSHConfig / SSHIntrusion / SecurityCheck |
| 计划任务 | GetCrontab / ManageCrontab |
| 频道 | GetChannel |

`serverInfo`: FastMCP 1.28.1 + `instructions`: 你是 BT MCP Harness（详细运维能力清单 + 红线：不得修改宝塔面板自身源码、不得修改 bt_agent_mcp 插件源码/凭据）。

## 关键障碍与解决

按发现顺序列出，**每个障碍都对应一个具体动作**。

### 障碍 1：服务端 IP 白名单拒绝

**现象**：POST initialize 返回 HTTP 403 `{"status": false, "msg": "ip denied"}`。
即便不带 token 也拒绝，说明 IP 检查在 auth 之前。

**解决**：联系 mcp_info.json 服务方放开 IP 白名单（服务端是宝塔的
`/www/server/panel/plugin/bt_agent_mcp/run_server.py`，自实现 uvicloud 应用）。
放开后 HTTP 200 initialize 正常响应。

### 障碍 2：服务端证书 SAN 不匹配 URL 的 IP

**现象**：`mcp_info.json` 的 URL 用 WSL 内 IP `172.29.51.111`，但服务端证书
SAN 只包含 `117.150.225.202`（用户公网 IP）和 `10.255.255.254`（WSL NAT IP）。
Node `ERR_TLS_CERT_ALTNAME_INVALID`：`IP: 172.29.51.111 is not in the cert's list`。

**为什么不能用 SAN 中的 IP**：
- `117.150.225.202`：TCP 不通（不可达）
- `10.255.255.254`：TCP 不通（不可达）

**解决**：客户端配置 `NODE_TLS_REJECT_UNAUTHORIZED=0`，让 Node 跳过 hostname 验证。
不安全但实用（仅内网 172.29.51.111:8765 风险可控）。

### 障碍 3：DSH 原生 MCP client 不支持 `env` 字段

**现象**：读 DSH 源码 `lib/index.js` line 753-761，`StreamableHTTPClientTransport` 的
Config schema 只有 `url`/`headers`，**没有 `env` 字段**。配置里写 `env` 字段被忽略。

**解决**：把 `env` 写到注册表 `HKCU\Environment`（`setx NODE_TLS_REJECT_UNAUTHORIZED 0`），
DSH 主进程继承系统 env 后，Node SDK 内部 fetch 调用读到 env。

### 障碍 4：AIX-WORK 插件用 curl 不读 env

**现象**：`@aix-work/plugin/lib/index.js` 的 `httpPostWithHeaders` (line 422-426) 用
curl 命令行作 HTTP 客户端，**不传 -k / --cacert / CURL_CA_BUNDLE**。即使系统 env
设了 `NODE_TLS_REJECT_UNAUTHORIZED=0`，curl 也不读这个 env（curl 是独立子进程）。

**解决**：用户修了 AIX-WORK 插件（dev 分支），让 curl argv 接受 `config.env.CURL_INSECURE=1` →
加 `-k`，以及 `config.env.CURL_CA_BUNDLE` → 加 `--cacert`。同样的修改也加到
`runHealthCheck`（line 716-719），否则 health check 永远返回 cn=0 显示 "No response"。

详见 `typecho-bugs/B001-aixwork-mcp-tls-config/bug_detail.txt`。

### 障碍 5：WSL 重启后 baota 服务没自动起

**现象**：服务在某次 WSL 重启后下线，`ss -tlnp` 看不到 8765 端口监听，
所有连接都是 `Connection refused`（Windows）/`timed out`（WSL 内）。

**注意**：之前看到的 `LISTEN 0.0.0.0:8765 python3 pid=488` 是 WSL 重启前的快照，
重启后服务进程不再存在（除非有 systemd / 开机启动脚本）。

**解决**：手动启动 baota 服务。WSL 内服务是宝塔官方插件：
```
/www/server/panel/pyenv/bin/python3 /www/server/panel/plugin/bt_agent_mcp/run_server.py
```
启动后会自动监听 0.0.0.0:8765。

## 故障排查清单

| 现象 | 原因 | 排查命令 |
|---|---|---|
| HTTP 403 ip denied | 服务端 IP 白名单 | 联系服务方加白 |
| ERR_TLS_CERT_ALTNAME_INVALID | 服务端证书 SAN 不含访问 IP | 改 URL 到 SAN 中的 IP，或设 `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| HTTP 0 + curl exit 28 | TCP 连接超时（防火墙 / 服务未启动） | `ss -tlnp 8765`、`curl --max-time 5 localhost:8765` |
| HTTP 0 + curl exit 60 | curl 不信任服务端证书 | 加 `-k` 或 `--cacert` / 装证书到系统信任库 |
| curl exit 7 | Connection refused | 服务端没监听端口 |
| `{"status":false,"msg":"ip denied"}` | 同第一项 | 同第一项 |
| HTTP 401 unauthorized | 缺 token 或 token 失效 | `.mcp.json` 的 headers.Authorization |
| HTTP 405 | GET 请求不接受（MCP 只接受 POST） | 用 POST + JSON-RPC body |
| `Health: No response` | AIX-WORK health check 没传 TLS | 改 AIX-WORK 或等 DSH 原生 MCP 接管 |
| `connected: false, tools: 0` | AIX-WORK 客户端失败 | 看 error 字段：curl exit / TCP / SSL |

## 网络位置参考

| 视角 | 可达性 |
|---|---|
| WSL 内 `curl localhost:8765` / `127.0.0.1:8765` / `172.29.51.111:8765` | ✅（同一网络命名空间） |
| Windows `curl localhost:8765` | ✅（WSL2 自动端口转发） |
| Windows `curl 172.29.51.111:8765` | ✅（WSL2 镜像网络，IP 直连） |
| 任何能解析路由的客户端 | ❌（服务只绑 WSL 内接口） |

## 沉淀的可复用脚本

在 `E:/deepseek_work/typecho/.claude/scripts/`：

| 脚本 | 用途 |
|---|---|
| `_test_mcp_reach.py` | 测试 baota-mcp 三个 URL + 多种 TLS 配置的可达性 |
| `_test_with_public_ip.js` | 用证书 SAN 中的 IP（公网 117.150.225.202）测试 |
| `_test_env_var.js` | 验证 env 变量对 https / fetch 的影响 |
| `_test_fetch_env.js` | 验证 fetch (undici) 是否读 env |
| `_test_post_from_wsl.js` | WSL 内 POST vs Windows POST 对比 |
| `_test_curl.py` | Windows curl 直连测试 |
| `_test_localhost.py` | localhost:8765 vs 172.29.51.111:8765 |
| `_full_retest.py` | 全量重测 baota-mcp |
| `_deep_probe.py` | 深查 baota 服务状态（端口监听、进程、防火墙） |
| `_compare_routes.py` | 对比路由 + 测试各种路径 |
| `_check_health_issue.py` | 健康检查逻辑 + baota 现状 |
| `_exact_health_check.py` | 精确模拟 AIX-WORK health check 命令 |
| `_check_with_k.py` | 用 `-k` 跑 health check |
| `_verify_baota_working.py` | tools/list 验证 baota-mcp 实际可用 |
| `_count_baota_tools.py` | 数工具数 + 列工具名 |
| `_probe_env.py` | 检查注册表 env 是否写入 |
| `_verify_user_env.py` / `_verify_user_env2.py` | 验证 env 是否被新进程继承 |
| `_install_baota_mcp.py` | 写 .mcp.json + 下载 skills |
| `_move_skills.py` / `_cleanup_wrong_skills.py` | 移动/清理 skills 目录 |
| `_locate_mcp_config.py` / `_locate_skills_path.py` | 定位 DSH 实际配置/技能路径 |
| `_finalize_baota_mcp.py` | 收尾：备份重命名 + 配置校验 |
| `_init_skeleton.py` / `_init_check.py` | AI 文档骨架与自检（初始化阶段产物） |
| `_start_typecho.py` / `_verify_server.py` / `_verify_alive.py` | WSL 跑 Typecho 服务端 |

## 关键要点

- **WSL 镜像网络让 Windows 直连 WSL eth0 IP**（172.29.51.111），不需要端口转发
- **两个 MCP 客户端并存**（AIX-WORK + DSH 原生），改了其中一个不影响另一个
- **setx 写 HKCU\Environment 对当前进程不生效**，需要新开 cmd/重启 shell
- **curl 是独立子进程，不读 NODE_TLS_REJECT_UNAUTHORIZED**，必须显式传 -k / --cacert
- **服务端 IP 白名单是真阻塞**，客户端所有 TLS 优化都绕不开
- **服务端 7 层架构**（入口→核心→业务→协议→工具→用户态→构建），每层都有不同包名空间
- **DSH 是 session-level MCP 加载**，新增 MCP 必须重启 DSH 才生效

## 经验教训

1. **AI 项目目录与工具链配置分离**：typecho 项目本身（`E:\deepseek_work\typecho`）
   只放项目代码 + AI 文档（`.claude/`）；DSH/AIX-WORK 工具链配置在 `C:\Users\huxu\AI\`。
   跨项目复制配置时要看清楚 basePath。

2. **配置源路径注入**（用户加的 configSection）：AI 模型"看到状态但不知道在哪改"
   是普遍痛点。所有 hook / 插件类项目都应该在系统提示里暴露配置源路径。

3. **证书链完整性**：自签证书场景下，**完整保存证书链**（叶子+中间+根）才能让
   客户端验证通过。仅给叶子证书是不够的。

4. **环境变量传递链路**：DSH 主进程 env → MCP SDK env → Node fetch env（如果传）。
   setx 写到 HKCU\Environment 后，需要 Explorer 重新加载，新进程才能继承。

5. **DSH 的 ACP 层读了 server.env 但 SDK 层不用**：这是 DSH 内部不一致，
   用户在 AIX-WORK 修了，但 DSH 原生 MCP client 的 schema 仍不接受 env。

## 相关

- 项目 CLAUDE.md §0.2 文档索引
- 项目 `typecho-DEVELOPER_RULES.md` 模块依赖 / 构建系统段
- 项目 `typecho-bugs/B001-aixwork-mcp-tls-config/bug_detail.txt`（已修复）
- 全局 `分析问题禁止瞎猜.md` —— 不要凭印象排查
- 全局 `Python优先规则.md` —— Windows 下用 Python subprocess 调外部命令
- 全局 `辅助脚本存放位置.md` —— 项目脚本放 `.claude/scripts/`
- 全局 `Git提交授权规则.md` —— 所有改动不自动 commit，等用户授权