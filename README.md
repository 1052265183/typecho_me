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
- 插件/主题兼容新 PHP 8.x 版本（CI 矩阵仅做语法检查，无运行时测试）
- docs.typecho.org 文档站与源码同步

### P2（生态）
- 第三方插件/主题市场（不在本仓库范围）

### 外部依赖
- docs.typecho.org（官方文档站）
- typecho/languages（i18n 语言仓库，由 `tools/Makefile langs` 拉取）
- GitHub Actions（CI/CD）

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

当前 ADR 索引见 `.claude/planning/02-技术设计/ADR-README.md`（初始化阶段尚未产生 ADR，后续技术决策按 writing-for-agents 沉淀）。

## 六、代码入口（接手先看）

| 入口类型 | 文件 | 说明 |
|---|---|---|
| 前台入口 | `index.php` | 26 行，是整个前端请求的入口 |
| 安装入口 | `install.php` | 引导配置 `config.inc.php` |
| 后台入口 | `admin/login.php` → `admin/manage-posts.php` 等 | 鉴权后直达各业务 widget |
| 核心基类 | `var/Typecho/Widget.php` | 551 行，所有 widget 继承 |
| 路由核心 | `var/Typecho/Router.php` | 191 行，`Router::match()` / `Router::dispatch()` |
| 数据库抽象 | `var/Typecho/Db/Adapter/` | `Mysql` / `Mysqli` / `Pdo` / `Pgsql` / `SQLite` |
| 插件示例 | `usr/plugins/HelloWorld/Plugin.php` | 最简单的插件样例 |
| 主题示例 | `usr/themes/default/index.php` | 内置默认主题入口 |

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
- **主题函数**：主题 `functions.php` 中常用 `_e()` 国际化 / `Typecho_Widget::widget()` 取组件；改主题前看 `usr/themes/default/functions.php`。
- **Dockerfile 已陈旧**：Ubuntu 16.04 + PHP 7.0.14，新部署勿用，要用 `tools/Makefile` 出的 tar.gz + 自己装 PHP-FPM/nginx。
- **Makefile 用 tar.gz 打包**：`tools/Makefile` 的 `package` target 输出 `build.tar.gz`，**不是** `.zip`；CI 的 zip 是 `.github/workflows/Typecho-release-Ci.yml` 用 `zip -q -r typecho.zip *` 打的。

## 八、文档地图（按场景 pointer 表）

| 场景 | 读哪份 |
|---|---|
| 第一次接触项目 | 本 README + `CLAUDE.md` |
| 改核心库/框架 | `CLAUDE.md §1 架构分层` + `var/Typecho/Widget.php` + `Router.php` |
| 改后台页面 | `CLAUDE.md §1` + `admin/` 目录 + 对应 Widget 源码 |
| 改数据库适配 | `var/Typecho/Db/Adapter/` + `CLAUDE.md §0.4` 已知缺口 |
| 写插件 | `usr/plugins/HelloWorld/Plugin.php` + http://docs.typecho.org/plugins/ |
| 写主题 | `usr/themes/default/` + http://docs.typecho.org/themes/ |
| 改构建/CI | `.claude/docs/typecho-DEVELOPER_RULES.md` + `.github/workflows/` |
| 排查 bug | `.claude/bugs/<bugId>/bug_detail.txt`（新建按规则第 3 步目录命名） |
| 调研未决问题 | `.claude/planning/glossary.md` OpenQ 区 + `.claude/docs/typecho-GAPS.md` |
| 沉淀新经验 | 按「生成经验文档」规则落 `.claude/docs/typecho-经验-xxx.md` |