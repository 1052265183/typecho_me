# Typecho 项目全景与 AI 接手指南（README）

> AI 接手第一文档。一读懂项目本质 + 当前进度 + 全部逻辑细节 + 代码入口 + 待决项。
> 官方社区入口：http://typecho.org/ ｜ 文档：http://docs.typecho.org/ ｜ 论坛：http://forum.typecho.org/

## 〇、项目规则（强制）

- 新对话必须先读本 README + 根 `CLAUDE.md`，建立全局认知后再动代码。
- 改代码后必须更新对应章节；若引入新决策/术语，同步更新 `.claude/planning/glossary.md` 与 ADR。

## 一、项目本质

**一句话**：Typecho 是基于 PHP + 自研 Widget 组件机制的开源博客平台，GPL 2.0 协议，支持 MySQL/MariaDB/PostgreSQL/SQLite 四种数据库。

**技术栈**：PHP 7.4.0+（CI 矩阵 7.4 / 8.0 / 8.1 / 8.2）、无 Composer/无第三方框架（自研 Widget 机制）、Node 18（仅用于构建 CSS/JS 压缩）。

**范围**：本仓库是 Typecho 上游官方仓库的本地镜像，AI 调试文件面向 Typecho 社区贡献者，**不是**本地运营站点，也不是私有 fork。

## 二、当前进度

### P0（核心维护）
- **CI 语法检查**：PHP 7.4/8.0/8.1/8.2 矩阵 `.github/workflows/Typecho-dev-Ci.yml`
- **Nightly 自动打包**：dev push 到 master 自动构建 `typecho.zip` 并上传到 nightly release
- **Release 自动打包**：发布 release 时构建并触发语言仓库构建

### P1（持续改进）
- 插件/主题兼容新 PHP 8.x 版本（CI 矩阵仅做语法检查，无运行时测试）→ 工单 G1
- docs.typecho.org 文档站与源码同步 → 外部依赖 E1

### P2（生态）
- 第三方插件/主题市场（不在本仓库范围）

### 外部依赖
详见 `.claude/docs/typecho-GAPS.md` §外部依赖阻塞（E1~E4），含触发条件与检查动作。

### 进度跟踪
工单编号、状态、验收标准见 `.claude/planning/03-任务拆解/工单清单.md`。

## 三、架构分层

```
入口层
  index.php ─── Widget\Init::alloc()
  install.php ── 数据库适配安装（MySQL/PgSQL/SQLite）
  admin/    ─── 后台管理（40+ PHP 页面）

核心层（var/Typecho/）
  Widget (基类) / Router / Plugin / Db / Http / I18n / Feed
  Config / Common / Cookie / Date / Request / Response / Validate

业务层（var/Widget/）
  Init / Archive / Comments / Feedback / Users / Metas / Options
  Contents / Backup / Login / Register / XmlRpc
  Helper/Form + Helper/Element/* + Helper/PageNavigator + Helper/Layout

协议层
  var/IXR/        XML-RPC 客户端/服务端/Pingback
  var/Utils/      HyperDown (Markdown) / AutoP / PasswordHash / Helper / Upgrade

用户态（usr/）
  plugins/<Name>/Plugin.php   插件
  themes/<theme>/             主题
  langs/<lang>.mo             语言包
  uploads/                    用户上传（git 忽略）

构建层（tools/）
  Makefile   Dockerfile   build.js   build_pot.php   yuicompressor-2.4.2.jar
```

完整模块关系详见 `.claude/planning/02-技术设计/架构图.md`。

## 四、核心数据流

**前台请求**：
```
HTTP → index.php
  → include config.inc.php (若无 → header Location: install.php)
  → Widget\Init::alloc()          // 初始化 DB / Options / User
  → Plugin::factory('index.php')->call('begin')   // begin 钩子
  → Typecho\Router::dispatch()    // 匹配路由表
  → Widget::widget($widgetClass)   // 实例化业务组件
  → 业务组件 execute() → 渲染主题
  → Plugin::factory('index.php')->call('end')     // end 钩子
```

**后台请求**：
```
HTTP → admin/<page>.php
  → require admin/common.php       // 鉴权 + Init
  → Widget\<PageWidget>::alloc()   // 直接实例化页面 widget
  → 渲染后台模板
```

## 五、关键决策索引（ADR-xxx）

当前 ADR 索引见 `.claude/planning/02-技术设计/ADR-README.md`。已有 ADR-001（WaterDrop 复制按钮与 PJAX 脚本注入架构，2026-09-27）；仓库历史先验决策（自研 Widget、4 数据库适配等）待按 writing-for-agents 逐步沉淀（工单 T2，见 `.claude/planning/03-任务拆解/工单清单.md`）。

## 六、代码入口（接手先看）

| 入口类型 | 文件 | 说明 |
|---|---|---|
| 前台入口 | `index.php` | 26 行，是整个前端请求的入口 |
| 安装入口 | `install.php` | 引导配置 `config.inc.php` |
| 后台入口 | `admin/login.php` → `admin/manage-posts.php` 等 | 鉴权后直达各业务 widget |
| 核心基类 | `var/Typecho/Widget.php` | 551 行，所有 widget 继承 |
| 路由核心 | `var/Typecho/Router.php` | 191 行，`Router::match()` / `Router::dispatch()` |
| 数据库抽象 | `var/Typecho/Db/Adapter/` | `Mysql` / `Mysqli` / `Pdo` / `Pgsql` / `SQLite` |
| 插件示例 | `usr/plugins/TinyMceForTypecho/Plugin.php` | 仓库内唯一在用的插件 |
| 主题示例 | `usr/themes/WaterDrop/index.php` | 唯一在用的主题入口 |

## 七、AI 接手指南

### 先读顺序（强制）

1. 本 README（项目全景）
2. 根 `CLAUDE.md`（代码规范 + 文档索引）
3. `.claude/planning/02-技术设计/架构图.md`（架构关系）
4. `.claude/docs/typecho-DEVELOPER_RULES.md`（模块依赖 / 构建系统 / Git）
5. `.claude/docs/typecho-GAPS.md`（动代码前必查）

### 常见坑

- **PHP 版本**：CI 矩阵仅检查 `php -l` 语法，**不保证运行时正确**；新代码需手测 7.4/8.0/8.1/8.2。
- **对象池**：`Widget::widget()` 用对象池管理实例，**禁止** `unset()` 后立刻期待重置；见 `var/Typecho/Widget.php` 第 26-32 行。
- **数据库适配**：`Db.php` 通过 `Adapter` 抽象 4 种数据库，新增 SQL 必须 4 库都跑通（`Mysql` / `Pgsql` / `SQLite` + `Pdo` 子类）。
- **插件钩子**：钩子命名是字符串（如 `index.php` / `begin` / `end`），**注意大小写一致**。
- **主题函数**：主题 `functions.php` 中常用 `_e()` 国际化 / `Typecho_Widget::widget()` 取组件；改主题前看 `usr/themes/WaterDrop/functions.php`。
- **主题 PJAX 脚本**：WaterDrop 启用 PJAX，`footer.php` 内联脚本只在整页加载执行一次；注入型功能必须挂 `pjax:complete` 重跑，`</script>` 闭合缺失 `php -l` 查不出、只有浏览器实测能暴露——4 条纪律见 `CLAUDE.md` §3，决策与理由见 ADR-001。
- **Dockerfile 已陈旧**：Ubuntu 16.04 + PHP 7.0.14，新部署勿用，要用 `tools/Makefile` 出的 tar.gz + 自己装 PHP-FPM/nginx。
- **Makefile 用 tar.gz 打包**：`tools/Makefile` 的 `package` target 输出 `build.tar.gz`，**不是** `.zip`；CI 的 zip 是 `.github/workflows/Typecho-release-Ci.yml` 用 `zip -q -r typecho.zip *` 打的。
- **本地开发环境在 WSL 里跑**：PHP 8.2 + Docker 装在 WSL "Android"（实际 Ubuntu 20.04）发行版中，MySQL 容器 `mysql_test` 映射端口 `13307`。快速启动 / 凭据 / 排障见 `CLAUDE.md` §0.5；完整还原流程见 `.claude/docs/typecho-DEVELOPER_RULES.md` §本地开发环境。
- **datadir 还原后 root 密码失效**：容器 env 的 `MYSQL_ROOT_PASSWORD` 只在镜像首次初始化时写入，替换 datadir 后失效；此时唯一可用凭据是备份中已存在的应用用户，改 MySQL 账号密码需先解决 `skip-grant-tables` 不落盘的问题（`glossary.md` OQ-005）。
- **跨环境比对文件哈希**：Windows 本地是 CRLF、Linux 是 LF，直接比 sha256 会把同一内容全盘误判为差异；本地侧先做 CRLF→LF 归一化，而二进制文件（png/woff/ttf）**跳过**归一化——对其做字节替换同样产生假差异（本次即因此误报 7 张图片不同）。见 `CLAUDE.md` §0.6.3。
- **base64 分块传输会把单词劈开**：手工把 base64 拆成多块用 `>`/`>>` 拼接，块边界可能落在单词中间，落盘后文件多一行、浏览器报语法错误，而「暂存区 vs 目标区」哈希比对**两边一起错、全部显示 OK**。闸门要卡本地原件：字节数 + 行数 + sha256 三方对上才算过。见 `CLAUDE.md` §0.6.3。
- **`cp -p` 保留的是暂存区属主**：从 `/tmp` 复制到线上目录时，`-p` 保留的是**暂存文件**的属主（root），不是目标区原有的 `www:www`。复制后需 `chown` / `chmod` 显式还原。见 `CLAUDE.md` §0.6.3。
- **正式环境已搬到本机 WSL**（2026-10-06 起，决策见 ADR-003）：Web 层用 `php -S` + `.claude/scripts/router.php` 跑在 `:8001`，代码在 `/root/www/typecho_prod`，数据库仍复用原容器。`CLAUDE.md` §0.6 的远程发布流程已作废，发布改用 `bash .claude/scripts/_deploy_prod.sh --apply`。
- **`php -S` 不支持 PATH_INFO**：永久链接形如 `/index.php/archives/1/` 依赖 PATH_INFO 路由，内置服务器会把后半段当文件名去找、直接 404——必须配 `router.php`，删了就全站文章页挂。
- **`pkill -f 'php -S …'` 会自杀**：执行它的 shell 命令行里同样含该字符串，会被一起杀掉；用 PID 文件停进程（`.claude/scripts/_prod_ctl.sh`）。
- **`rsync -a` 会保留目录 mtime**：备份脚本按 `-mtime` 清理时，会把刚建的快照当成陈旧项删掉（源 uploads 目录 mtime 是"最后一次上传"的时间）——`rsync` 后必须 `touch` 重置。
- **从 Windows 侧调 WSL 别拼命令行**：PowerShell 会吃掉引号和重定向（`>/tmp/x` 变成 `E:\tmp\x`），复杂命令一律写成 `.claude/scripts/*.sh` 再 `wsl -- bash` 执行。

## 八、文档地图（按场景 pointer 表）

| 场景 | 读哪份 |
|---|---|
| 第一次接触项目 | 本 README + `CLAUDE.md` |
| 启动本地开发环境 | `.claude/docs/typecho-DEVELOPER_RULES.md` §本地开发环境 |
| 发布 / 部署到正式环境 | `CLAUDE.md` §0.6（硬约束 + 正式环境拓扑 + 5 步发布流程） |
| 改核心库/框架 | `CLAUDE.md §1 架构分层` + `var/Typecho/Widget.php` + `Router.php` |
| 改后台页面 | `CLAUDE.md §1` + `admin/` 目录 + 对应 Widget 源码 |
| 改数据库适配 | `var/Typecho/Db/Adapter/` + `CLAUDE.md §0.4` 已知缺口 |
| 写插件 | `usr/plugins/TinyMceForTypecho/Plugin.php` + http://docs.typecho.org/plugins/ |
| 写主题 | `usr/themes/WaterDrop/` + `CLAUDE.md` §3（主题 PJAX 脚本纪律）+ http://docs.typecho.org/themes/ |
| 改构建/CI | `.claude/docs/typecho-DEVELOPER_RULES.md` + `.github/workflows/` |
| 排查 bug | `.claude/bugs/<bugId>/bug_detail.txt`（新建按规则第 3 步目录命名） |
| 调研未决问题 | `.claude/planning/glossary.md` OpenQ 区 + `.claude/docs/typecho-GAPS.md` |
| 跟踪任务进度 / 看还有什么没做完 | `.claude/planning/03-任务拆解/工单清单.md`（状态总览表 + 验收标准） |
| 沉淀新经验 | 按「生成经验文档」规则落 `.claude/docs/typecho-经验-xxx.md` |