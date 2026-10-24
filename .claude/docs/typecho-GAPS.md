# Typecho 已知缺口（GAPS）

> 动代码前先对这份文档。本文件按三段组织：代码缺口（影响代码正确性）、待办（非阻塞改进）、外部依赖阻塞（需等待外部动作）。
> **本文件只管背景与理由**；每条的编号、状态、验收标准、依赖在 `.claude/planning/03-任务拆解/工单清单.md` 同号条目查，改状态去那里改。

## 代码缺口

> 影响代码正确性、可维护性或新功能实现的缺口。每条需带编号（G1~Gn）。

- **G1：CI 仅 `php -l` 语法检查，无运行时测试**
  - 现象：`.github/workflows/Typecho-dev-Ci.yml` 第 29 行仅跑 `find . -type f -name '*.php' | xargs -0 -n1 -P4 php -l -n`，不保证 4 种 PHP 版本（7.4/8.0/8.1/8.2）下代码运行正确。
  - 影响：依赖 PHP 8.x 新特性（命名参数、match 表达式、枚举）改动不会被 CI 拦截。
  - 后续：待决策是否引入 PHPUnit（工单 G1，结论落 ADR-004）；短期手动测试 4 个 PHP 版本。

- **G2：`var/Typecho/Widget.php` 单文件 551 行**
  - 现象：核心基类 `Widget` 含对象池管理 + 魔术属性 + 配置获取 + 路由联动，单一职责偏大。
  - 影响：新人接手门槛、单元测试难度、修改牵连面广。
  - 后续：待讨论是否拆分为 `WidgetPool` / `WidgetProperties` / `WidgetBase` 等（工单 G2，方案落 ADR-007）。

- **G3：`tools/Dockerfile` 已陈旧**
  - 现象：基于 Ubuntu 16.04 + 自编译 PHP 7.0.14 + nginx 1.10.2，2018 年后未更新；官方 README 未推荐使用。
  - 影响：按 Dockerfile 部署将暴露已知安全漏洞（Ubuntu 16.04 EOL）。
  - 后续：待决策是重写还是从仓库移除（工单 G3，结论落 ADR-006）。

- **G4：4 种数据库适配差异未自动化覆盖**
  - 现象：`var/Typecho/Db/Adapter/` 含 `Mysql` / `Mysqli` / `Pgsql` / `SQLite` + `Pdo` 子类，新增 SQL 需人工测 4 库。
  - 影响：DB 相关 PR 容易漏测某库（如 SQLite 对 CTE 支持有限）。
  - 后续：依赖 G1 解决（PHPUnit 引入后加 DB 集成测试）。

- **G5：代码块复制按钮无 `execCommand` 兜底（ADR 决策已定但实现未落地）** —— **已修复（2026-09-28，工单 G5 已完成）**
  - 原现象：`usr/themes/WaterDrop/footer.php` 的 `injectCopyButtons()` 只调 `navigator.clipboard.writeText(text).then(...)`，既无 `.catch()` 降级也无 `execCommand` 兜底；而 `ADR-001` 决策 4 明确要求「API 优先 + execCommand 兜底」、备选 C 明确否决「仅用 navigator.clipboard」。该逻辑仍留在 `footer.php` 内联，与 ADR-001 备选 A（否决「全部留内联」）冲突。
  - 叠加问题：`copy-page.js` 的 `fallbackCopy()` 只挂在 `.catch()` 上，而 ADR-001 背景 3 记录 http 下 Promise 可能**静默挂起**（既不 resolve 也不 reject），此时 `.catch()` 永不触发，整页复制按钮同样无反馈。
  - 修法与验证：新增 `static/js/clipboard.js`（三段式：API → 800ms 超时 → `execCommand`）与 `static/js/copy-code.js`（代码块逻辑外置 + 事件委托 + PJAX 重跑），两套复制逻辑共用同一份兜底；正式环境 http 下已用真实点击验证两个按钮均有反馈。方案见 `02-技术设计/ADR-002`，验收记录见 `03-任务拆解/工单清单.md` G5。

- **G6：`usr/plugins/TinyMceForTypecho/download-proxy.php` 安全缺陷（随插件入库，缺陷暂不修复）**
  - 现象：509 行的外链图片抓取端点，六处问题——
    1. **SSRF**：第 28 行直接取 `$_POST['url']` 发起请求，无 URL 白名单、不拒绝内网地址（`127.0.0.0/8`、`10/8`、`172.16/12`、`192.168/16`、`169.254/16`、环回与 IPv6 本地段），也未限制协议。
    2. **零鉴权 + 可写盘**：无任何登录态校验即接受请求，第 340 行把下载内容写入 `usr/uploads/`。
    3. **扩展名黑名单漏 `svg`**：第 258 行的封禁列表含 `php`/`js`/`html` 等，但 SVG 可携带脚本，构成存储型 XSS。
    4. **关闭 TLS 校验**：第 133-134、200-201 行将 `SSL_VERIFYPEER` / `VERIFYHOST` / `verify_peer` 全部置 false。
    5. **PHP 版本不兼容**：第 7 行 `ini_set('log_errors', value: 0)` 用 PHP 8.0 命名参数，项目支持 PHP 7.4（CI 矩阵含 7.4），该文件在 7.4 下解析即致命错误。
    6. **报错泄露**：各失败分支的 `debug` 字段回显服务器绝对路径、原始 URL 与底层错误详情。
  - 影响：插件入库即随仓库分发；推到 Typecho 公开 GitHub 等同于公开该端点。缺陷登记但本轮不修，是有意决定（保留全量入库诉求，改为挂工单跟踪）。
  - 后续：验收标准与修复项见 `03-任务拆解/工单清单.md` G6；修复前该端点不应暴露在公网。

## 待办

> 非阻塞改进项，每条带编号（T1~Tn）。

- **T1：PHP 最低版本升级调研**
  - 当前 CI 矩阵仍含 PHP 7.4，但实际部署中很多插件已不兼容 7.4；建议下个主版本提升最低版本到 8.0 或 8.1。
  - 行动：查 GitHub Issues 中「php 7.4 不兼容」类标签的现状；同步到 ADR。

- **T2：补 ADR 历史决策沉淀**
  - ADR-001（WaterDrop 复制按钮与 PJAX 脚本注入架构，2026-09-27）已产生；仓库历史「先验决策」仍待按主题补写（自研 Widget、4 数据库适配、路由表机制等）。
  - 行动：按 writing-for-agents 模板补 ADR-NNN-xxx；编号映射见 `02-技术设计/ADR-README.md` 的「编号预留」段（002 已被正式环境同步占用）：G1→004、T1→005、G3→006、G2→007。

- **T3：扩展 glossary**
  - 当前 `planning/glossary.md` 含基础术语 + OpenQ，后续调研中遇到新缩写/业务概念追加。

- **T4：CI matrix 增加 nightly release asset 校验**
  - 当前 dev CI 自动上传到 nightly release（asset ID `49532662`），但未校验上传是否成功；可加 `actions/github-script` 校验 HTTP 状态。

- **T5：插件/主题开发文档本地化**
  - 依赖 docs.typecho.org（外部站），可在 `planning/05-参考资料/` 下做一份摘录/镜像版本，断网时也能查。

- **T6：内网穿透未切到新正式环境**
  - 现状：`siteUrl` 为 `http://xkj88.e3.luyouxia.net:29026`，穿透客户端仍把映射指向旧宝塔容器的 22380；新正式环境跑在本机 `:8001`（ADR-003）。
  - 影响：不切换则外网访问仍是旧环境，开发成果无法从外网看到；此时用 `localhost:8001` 打开，静态资源也仍按 `siteUrl` 指向穿透域名。
  - 行动：在内网穿透服务商后台把映射端口改为 8001（客户端不在本仓库内，无法代劳）。

- **T7：正式环境开机自启** —— **已解决（2026-10-24，工单 T7 已完成）**
  - 原状：`php -S` 由手工 `_prod_ctl.sh start` 拉起，WSL 重启后服务消失（实测 `curl localhost:8001` 返回 000），且抢在数据库容器就绪前启动会导致全站 503。
  - 解法：WSL 内 systemd unit `typecho-prod.service` 随 WSL 启动自动拉起（`Restart=always` 自愈）；`ExecStartPre` 调 `typecho-prod-wait-db` 先等 Docker 与 MySQL 就绪再起服务；备份由 `typecho-backup.timer` 每日 03:30 执行（`Persistent=true` 补跑错过时段）。
  - **明确不做**：Windows 开机自启。Windows 冷启动后 WSL 本身不自启，博客会保持下线直到用户打开 WSL——这是有意取舍，不是缺口。决策见 ADR-003「2026-10-24」段。

- **T8：正式环境数据库口令已泄漏，需轮换**
  - 现状：2026-10-06 排查时，脱敏正则未匹配 Typecho 的实际写法（`'password' => '...'`），正式库口令与账号被明文打印进 AI 会话记录。新环境 `config.inc.php` 沿用同一组凭据。
  - 影响：若本项目代码或该会话记录外泄，等同于数据库凭据外泄。数据库仅本机可达（`:13306`），未暴露公网。
  - 行动：改口令需注意 `mysql_wlzr` 的 datadir 源自备份、root 改密存在 `skip-grant-tables` 不落盘的老问题（OQ-005）；应用用户自身的口令可用应用权限或 root 改，需先验证写入是否生效。

- **T9：正式环境残留根目录错位副本** —— **已清理（2026-10-06，工单 T9 已完成）**
  - 原状：`/root/www/typecho_prod/TinyMceForTypecho/`（约 280 文件，11MB）是历史上放错位置的插件副本，与 `usr/plugins/TinyMceForTypecho/` 内容重复；开发目录已于 2026-10-06 清理并归位。
  - 处理：先打 56MB 备份到 `/root/backups/typecho/removed_extras_20261006.tar.gz`，`git clean -nd` 预演确认 `config.inc.php` 与 `usr/uploads` 不在删除列表后再执行；另清除 9 个多余插件与 4 个非 WaterDrop 主题（`theme=WaterDrop` 且 `plugin:active` 不存在，删除无风险）。

## 外部依赖阻塞

> 需等待外部团队/接口/上游的项，影响 Typecho 开发节奏。

- **E1：docs.typecho.org 文档同步**
  - 官方文档站（http://docs.typecho.org/）由社区维护；源码改动需同步更新文档。
  - 阻塞：若仅改源码不发文档，插件/主题开发者可能错过新 API。

- **E2：typecho/languages 语言仓库**
  - i18n 语言包仓库（https://github.com/typecho/languages）；新功能引入需同步更新 POT 文件。
  - 流程：本地 `cd tools && make pot` 生成 `messages.pot`，PR 到 typecho/languages。

- **E3：GitHub Actions Runner**
  - CI 依赖 GitHub 托管 Runner（`ubuntu-latest`）；如 Runner 出问题，CI 会失败但与代码无关。
  - 监控：dev CI 失败时先看 GitHub Status（https://www.githubstatus.com/）。

- **E4：GPL 2.0 协议合规**
  - 二次分发（fork、商业产品集成）需保留 GPL 2.0 协议与版权声明；企业用户接入前需法务确认。
  - 行动：新模块引入第三方代码时核查许可兼容性（GPL 兼容 / 独立许可）。