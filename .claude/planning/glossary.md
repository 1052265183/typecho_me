# 领域术语表（Glossary）

> Typecho 项目的领域术语 + 缩写 + 业务概念 + 开放问题。引入新术语时同步追加。

## 术语

| 术语 | 含义 | 出处 / 备注 |
|---|---|---|
| **Widget** | Typecho 自研组件基类，位于 `var/Typecho/Widget.php`；所有业务组件（Archive / Comments / Init 等）继承之 | `Widget::widget()` 用对象池管理 |
| **Plugin** | 钩子机制，通过 `Typecho\Plugin::factory('<hook_point>')->call('hook_name')` 触发；插件入口 `usr/plugins/<Name>/Plugin.php` | `var/Typecho/Plugin.php` |
| **Theme** | 前端模板，`usr/themes/<theme>/`，至少含 `functions.php` / `index.php` / `header.php` / `footer.php` / `style.css` | `usr/themes/default/` 示例 |
| **Hook Point** | 字符串标识的钩子锚点，如 `index.php` / `begin` / `end` / `admin/<page>.php` 等 | 见 Plugin 文档 |
| **DB Adapter** | 数据库适配抽象：`var/Typecho/Db/Adapter/` 下分 `Mysql` / `Mysqli` / `Pgsql` / `SQLite` + `Pdo` 子类 | 4 库适配，新增 SQL 需全部跑通 |
| **HyperDown** | Typecho 自研 Markdown 解析器，位于 `var/Utils/HyperDown.php` | 区别于 CommonMark |
| **AutoP** | 自动段落生成（按 `\n\n` 切段并包 `<p>`），位于 `var/Utils/AutoP.php` | 评论内容常用 |
| **IXR** | Incutio XML-RPC 库的 Typecho 移植版（`var/IXR/`），含 Client / Server / Pingback 实现 | Typecho 提供 XML-RPC 与 Pingback 服务 |
| **Object Pool** | `Widget::$widgetPool` 静态数组，缓存 widget 实例避免重复构造 | 见 `var/Typecho/Widget.php` 第 26-32 行 |
| **Pingback** | XML-RPC 协议的应用，用于博客引用通知；Typecho 服务端实现见 `var/IXR/Pingback.php` | — |
| **Nightly** | 每日构建，由 `.github/workflows/Typecho-dev-Ci.yml` 在 dev push 到 master 时自动打包上传（asset ID `49532662`） | 与正式 release 区分 |

## 缩写

| 缩写 | 全称 | 说明 |
|---|---|---|
| **PDO** | PHP Data Objects | `var/Typecho/Db/Adapter/Pdo/` 提供 3 种 PDO 子类（Mysql / Pgsql / SQLite） |
| **PSR-4** | PHP Standards Recommendation #4 | 自动加载规范，Typecho 类名 = 文件名（含命名空间） |
| **PSR-2** | PHP Standards Recommendation #2 | 代码风格规范 |
| **PHP-FPM** | PHP FastCGI Process Manager | 推荐部署方式（Dockerfile 已陈旧，勿用） |
| **GPL 2.0** | GNU General Public License version 2 | Typecho 协议；二次分发须保留 |
| **CI** | Continuous Integration | `.github/workflows/Typecho-dev-Ci.yml` |
| **POT** | Portable Object Template | i18n 模板，`tools/build_pot.php` 生成 |
| **MO** | Machine Object | 编译后的 i18n 文件，`usr/langs/<lang>.mo` |

## OpenQ（开放问题）

> 调研或开发过程中遇到、尚未形成决策结论的问题，记到这里；解决方案确定后写入 ADR 后删除本条。

- **OQ-001**：Typecho 是否计划升级 PHP 最低版本到 8.0 或 8.1？（当前 CI 矩阵仍含 7.4，但实际部署中很多插件已不支持 7.4；需查 GitHub Issues 与论坛调研）
- **OQ-002**：是否引入单元测试框架（PHPUnit）？当前 CI 仅 `php -l` 语法检查，无运行时测试，详见 `typecho-GAPS.md`。
- **OQ-003**：`tools/Dockerfile` 已是 Ubuntu 16.04 + PHP 7.0.14，是否需要重写或弃用？（README 未推荐使用，需查社区推荐部署方式）
- **OQ-004**：`var/Typecho/Widget.php` 551 行是否需要拆分？（基类 + 对象池 + 魔术属性，单一职责可能偏大；待讨论）