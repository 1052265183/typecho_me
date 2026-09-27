# Typecho 已知缺口（GAPS）

> 动代码前先对这份文档。本文件按三段组织：代码缺口（影响代码正确性）、待办（非阻塞改进）、外部依赖阻塞（需等待外部动作）。

## 代码缺口

> 影响代码正确性、可维护性或新功能实现的缺口。每条需带编号（G1~Gn）。

- **G1：CI 仅 `php -l` 语法检查，无运行时测试**
  - 现象：`.github/workflows/Typecho-dev-Ci.yml` 第 29 行仅跑 `find . -type f -name '*.php' | xargs -0 -n1 -P4 php -l -n`，不保证 4 种 PHP 版本（7.4/8.0/8.1/8.2）下代码运行正确。
  - 影响：依赖 PHP 8.x 新特性（命名参数、match 表达式、枚举）改动不会被 CI 拦截。
  - 后续：OQ-002 待决策是否引入 PHPUnit；短期手动测试 4 个 PHP 版本。

- **G2：`var/Typecho/Widget.php` 单文件 551 行**
  - 现象：核心基类 `Widget` 含对象池管理 + 魔术属性 + 配置获取 + 路由联动，单一职责偏大。
  - 影响：新人接手门槛、单元测试难度、修改牵连面广。
  - 后续：OQ-004 待讨论是否拆分为 `WidgetPool` / `WidgetProperties` / `WidgetBase` 等。

- **G3：`tools/Dockerfile` 已陈旧**
  - 现象：基于 Ubuntu 16.04 + 自编译 PHP 7.0.14 + nginx 1.10.2，2018 年后未更新；官方 README 未推荐使用。
  - 影响：按 Dockerfile 部署将暴露已知安全漏洞（Ubuntu 16.04 EOL）。
  - 后续：OQ-003 待决策是重写还是从仓库移除。

- **G4：4 种数据库适配差异未自动化覆盖**
  - 现象：`var/Typecho/Db/Adapter/` 含 `Mysql` / `Mysqli` / `Pgsql` / `SQLite` + `Pdo` 子类，新增 SQL 需人工测 4 库。
  - 影响：DB 相关 PR 容易漏测某库（如 SQLite 对 CTE 支持有限）。
  - 后续：依赖 G1 解决（PHPUnit 引入后加 DB 集成测试）。

## 待办

> 非阻塞改进项，每条带编号（T1~Tn）。

- **T1：PHP 最低版本升级调研**
  - 当前 CI 矩阵仍含 PHP 7.4，但实际部署中很多插件已不兼容 7.4；建议下个主版本提升最低版本到 8.0 或 8.1。
  - 行动：查 GitHub Issues 中「php 7.4 不兼容」类标签的现状；同步到 ADR。

- **T2：补 ADR 历史决策沉淀**
  - ADR-001（WaterDrop 复制按钮与 PJAX 脚本注入架构，2026-09-27）已产生；仓库历史「先验决策」仍待按主题补写（自研 Widget、4 数据库适配、路由表机制等）。
  - 行动：按 writing-for-agents 模板补 ADR-NNN-xxx。

- **T3：扩展 glossary**
  - 当前 `planning/glossary.md` 含基础术语 + OpenQ，后续调研中遇到新缩写/业务概念追加。

- **T4：CI matrix 增加 nightly release asset 校验**
  - 当前 dev CI 自动上传到 nightly release（asset ID `49532662`），但未校验上传是否成功；可加 `actions/github-script` 校验 HTTP 状态。

- **T5：插件/主题开发文档本地化**
  - 依赖 docs.typecho.org（外部站），可在 `planning/05-参考资料/` 下做一份摘录/镜像版本，断网时也能查。

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