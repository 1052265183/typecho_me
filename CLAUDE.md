# Typecho — 代码开发规范（Claude 项目指令）

> 本文件是 Claude Code 在 Typecho 项目写代码时必须遵守的代码层规范。

## 0. 项目概况

- **语言/框架/版本**：PHP 7.4.0+（CI 矩阵 7.4 / 8.0 / 8.1 / 8.2）；自研 Widget 组件机制（无 Composer、无第三方框架依赖）；数据库 MySQL/MariaDB/PostgreSQL/SQLite 任选其一。
- **包名根/模块结构**：
  - 入口与安装：`index.php` / `install.php`
  - 后台：`admin/`
  - 核心库：`var/Typecho/`（Db / Router / Plugin / Http / I18n / Feed / Cookie / Config / Common / Validate / Widget 基类等）
  - 业务组件：`var/Widget/`（Archive / Comments / Feedback / Users / Metas / Options / Contents / Init / Backup 等）
  - 表单助手：`var/Widget/Helper/`
  - XML-RPC 协议：`var/IXR/`
  - 工具：`var/Utils/`（HyperDown Markdown / AutoP 自动段落 / PasswordHash / Helper / Upgrade）
  - 用户态：`usr/plugins/` / `usr/themes/` / `usr/langs/` / `usr/uploads/`
  - 构建工具链：`tools/`（Makefile + Dockerfile + build.js + build_pot.php + yuicompressor）
- **命名空间根**：`Typecho\` `Widget\` `Utils\` `IXR\`（PSR-4 风格，与目录结构一一对应）
- **标识符特殊拼写**：遵循 **PSR-4 + PSR-2**；类名大驼峰、文件名 = 类名；命名空间按目录反向映射。无 Typecho 特有的奇怪拼写。

| 项目前缀 | 项目短名 | 标识符驼峰 |
|---|---|---|
| `typecho-` | `typecho` | `Typecho` |

## 0.1 项目文档与上下文（强制）

- 新对话必须先读本文件 + `README.md`（AI 接手指南）建立全局认知。
- 改代码后必须更新本文件相关章节；若引入新概念、新决策，同步更新 `.claude/planning/glossary.md` 与 `.claude/planning/02-技术设计/ADR-xxx.md`。
- 架构/产品/依赖变更必须先写 ADR 沉淀，后动代码。

## 0.2 文档索引（完整，按目录遍历）

| 路径 | 内容 | 何时读 |
|---|---|---|
| `.claude/docs/typecho-DEVELOPER_RULES.md` | 模块依赖 / 构建系统 / Git 规范 / 环境变量 | 改构建/依赖/CI 时 |
| `.claude/docs/typecho-GAPS.md` | 当前已知缺口（G1~Gn / T1~Tn / 外部依赖） | 动代码前必查 |
| `.claude/planning/README.md` | planning 总览（5 子目录职责） | 了解文档结构 |
| `.claude/planning/glossary.md` | 领域术语表 + OpenQ | 引入新术语/未决问题时 |
| `.claude/planning/01-需求分析/` | PRD / UE / 协议接口梳理 | 理解需求/协议时 |
| `.claude/planning/02-技术设计/ADR-README.md` | ADR 索引 | 查技术决策来源 |
| `.claude/planning/02-技术设计/架构图.md` | 模块关系图 | 看整体架构 |
| `.claude/planning/03-任务拆解/` | P0/P1/P2 工单 + 依赖图 | 拆任务/排期 |
| `.claude/planning/04-开发计划/` | 版本开发计划（路线图） | 规划版本 |
| `.claude/planning/05-参考资料/` | 外部文档链接 + 本地参考实现索引 | 找参考实现 |
| `.claude/plans/` | 临时执行计划（compile-xxx.md 等） | 当前会话在做的活 |
| `.claude/skills/` | 项目级 skill（SKILL.md） | 项目特定工作流 |
| `.claude/scripts/` | 辅助脚本（`_xxx.py` / `_xxx.sh`） | 跑一次性脚本 |
| `.claude/bugs/<bugId>/bug_detail.txt` | bug 记录 | 排查 bug 时 |
| `.claude/tmp/` | 临时文件（不进 git） | 调试草稿 |
| `.claude/screenshots/` | 截图（`ref_` / `dev_` / `v<N>_` 前缀） | 视觉对比 |
| `.claude/ui-dumps/` | UI dump（XML） | 排查前端层级 |

仓库内 GitHub 平台契约件（**不进 AI 文档结构**，保留原位）：

| 路径 | 用途 |
|---|---|
| `README.md` | 项目全景（已重写为 AI 接手指南） |
| `CONTRIBUTING.md` | 社区贡献指南 |
| `CODE_OF_CONDUCT.md` | 社区公约 |
| `SECURITY.md` | 安全报告策略（security@typecho.org） |
| `LICENSE.txt` | GPL 2.0 |
| `.github/ISSUE_TEMPLATE/` | Bug / Feature / Enhancement 模板 |
| `.github/PULL_REQUEST_TEMPLATE/` | PR 模板 |
| `.github/workflows/` | Typecho-dev-Ci / Typecho-hotfix-Merge / Typecho-release-Ci |

## 0.3 分析问题禁止瞎猜（强制）

- 先读本文件 §0.2 文档索引与 `.claude/docs/typecho-GAPS.md`；
- 改协议/接口字段前先读 `.claude/planning/01-需求分析/` 与 [docs.typecho.org](http://docs.typecho.org/)；
- 代码查实际实现：用 Read 实际源码，不凭文档描述猜逻辑；
- 实在找不到实现逻辑、查用户补充（给选项 + 依据），用户确认后按 writing-for-agents 归档。

## 0.4 当前已知缺口（强制）

- 动代码前必须先对 `.claude/docs/typecho-GAPS.md`；
- 当前 GAPS 文档已建但为初始模板状态，待第一轮调研后补充具体缺口（详见 `typecho-GAPS.md`）。

## 1. 架构分层与请求流

- **入口流**：`index.php` 第 17~23 行：`\Widget\Init::alloc()`（初始化）→ `\Typecho\Plugin::factory('index.php')->call('begin')`（begin 钩子）→ `\Typecho\Router::dispatch()`（路由分发）→ end 钩子。
- **路由**：`var/Typecho/Router.php` `match()` 按路径匹配路由表，返回 `Widget::widget($route['widget'], ...)` 实例化。
- **组件基类**：`var/Typecho/Widget.php`（551 行），所有 widget 继承之；`Widget::widget()` 用对象池管理。
- **后台独立入口**：`admin/` 下若干 PHP 页面（40+ 文件），各自直接走 Widget 链路。
- **插件钩子**：通过 `Typecho\Plugin::factory()` 注册；插件入口位于 `usr/plugins/<Name>/Plugin.php`。

## 2. 命名规范

- **类/文件名**：大驼峰、文件名 = 类名（含命名空间路径），遵循 PSR-4。
- **命名空间**：与目录反向映射，`var/Typecho/Db/Adapter/Pdo/Mysql.php` → `Typecho\Db\Adapter\Pdo\Mysql`。
- **方法/属性**：小驼峰；私有/保护成员按上下文命名（不必强制下划线前缀）。
- **禁止全限定类名**：方法签名、变量、常量等一律 `use` 后用短名；同文件冲突除外。
- **if 必须加花括号**：单行 if 也禁止（即使 `if ($x) return $y;` 也写成块）。
- **注释**：用中文；只在关键逻辑、业务规则、规避过的坑、魔法数字处加；不解释「做什么」（详见全局注释规则）。
- **@property 注解**：`Widget` 基类大量使用 `@property` 标注魔术属性，子类继承后 IDE 可识别。

## 3. 插件与主题开发规约

- **插件**：`usr/plugins/<PluginName>/Plugin.php`（示例 `HelloWorld/Plugin.php`）；实现 `\Typecho\Plugin\PluginInterface`；通过 `Typecho\Plugin::factory('<hook_point>')` 挂载钩子。
- **主题**：`usr/themes/<theme_name>/`；至少含 `functions.php` / `index.php` / `header.php` / `footer.php` / `comments.php` / `404.php` / `page.php` / `post.php` / `style.css`；可选 `screenshot.png`。
- **语言包**：`usr/langs/<lang>.mo`（由 `tools/Makefile langs` 拉取 `typecho/languages` 编译）；源代码用 `tools/build_pot.php` 生成 `messages.pot`。

## 4. 构建与发版

- **CI 测试**：`.github/workflows/Typecho-dev-Ci.yml` 在 `master` 分支 push/PR 上跑 `php -l` 语法检查（PHP 7.4 / 8.0 / 8.1 / 8.2 矩阵）；push 到主仓库（非 PR）自动打包并上传到 nightly release（asset ID `49532662`）。
- **发布构建**：`.github/workflows/Typecho-release-Ci.yml` 在 `release: published` 时构建 `typecho.zip` 并触发语言仓库构建。
- **本地构建工具**（在 `tools/` 下，详见 `typecho-DEVELOPER_RULES.md`）：
  - `Makefile`：git shallow clone → CSS/JS 压缩 → `php -l` 语法检查 → `tar.gz` 打包。
  - `Dockerfile`：Ubuntu 16.04 + 自编译 nginx 1.10.2 + PHP 7.0.14 + MySQL（**已陈旧**，新部署勿用）。
  - `build.js`（Node 18，依赖 uglify-js + node-sass + sprite-magic-importer）：`npm run build_js` / `build_css` / `build_css:theme`。
  - `build_pot.php`：i18n POT 文件生成（`make pot`）。
  - `yuicompressor-2.4.2.jar`：CSS/JS 压缩（`Makefile` 用）。

## 5. 测试与 CI

- 当前 CI 只跑 `php -l` 语法检查，**无单元测试**（详见 `typecho-GAPS.md`）。
- 本地快速检查：`for i in $(find var admin usr -name '*.php'); do php -l $i || exit 1; done`（等价 `make test`）。

## 6. 安全与合规

- **协议**：GPL 2.0（`LICENSE.txt` + `tools/package.json` 已声明 `GPL-2.0-only`）；二次分发须保留协议与版权声明。
- **密钥**：不硬编码密钥（数据库口令靠 `config.inc.php`，不进 git）；任何新增密钥配置走 `.claude/docs/typecho-DEVELOPER_RULES.md` 的「环境变量」段。
- **入口校验**：`index.php` 第 11 行先尝试 `config.inc.php`，缺失则跳转 `install.php`；新模块切勿绕过此机制。
- **提交前**：跑完全局安全检查 8 项（硬编码密钥 / 输入验证 / SQL 注入 / XSS / CSRF / 鉴权 / 速率限制 / 错误信息脱敏）。

## AI 协作约定

> 所有 AI 协作约定（输出语言、注释、全限定类名、if 花括号、Python 优先、
> library_test 隔离、Android 子包目录、Git 提交授权与模板、Hook 系统、
> Skill 执行纪律、Agent 编排……）以 AIX-WORK 插件本会话已加载的全集规则为准。
> 本文件不复述，避免与权威信源漂移。需要概览时用 `aix_work_diag` 工具查询。