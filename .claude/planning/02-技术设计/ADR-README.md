# ADR 索引

> Typecho 项目的架构决策记录（Architecture Decision Records）索引。
> 详细 ADR 按 `ADR-NNN-<主题>.md` 命名，主题用中文短句；本表按主题分类列。

## 当前状态

已产生 1 条 ADR（ADR-001，2026-09-27，WaterDrop 主题复制按钮与 PJAX 脚本注入架构）。本仓库历史悠久，README/CONTRIBUTING/源码中蕴含大量「先验决策」（如 PHP 版本选择、Widget 自研机制、4 数据库适配方案），但未按 ADR 形式沉淀。后续如有重大技术决策（重构、依赖变更、PHP 版本升级、数据库 schema 变动等），按 writing-for-agents 流程补写。

## ADR 模板

新建 ADR 时按以下结构（详见 writing-for-agents 技能）：

```markdown
# ADR-NNN: <主题>

**状态**：提议 / 已采纳 / 已修订 / 已废弃
**日期**：YYYY-MM-DD

## 背景
要解决什么问题？为什么现在做？

## 决策
最终选了什么？关键参数。

## 备选
否决了哪些方案？为什么否决？

## 影响
对现有代码/部署/兼容性/测试的影响范围。
```

## 索引表

| ADR | 主题 | 状态 | 日期 | 影响范围 |
|---|---|---|---|---|
| [ADR-001](ADR-001-WaterDrop复制按钮与PJAX脚本注入架构.md) | WaterDrop 复制按钮与 PJAX 脚本注入架构 | 已采纳 | 2026-09-27 | `usr/themes/WaterDrop/` |

## 修订规则

- 原决策修订：在原 ADR 文件末尾加「修订」段，记录新日期、新决策、变更理由；**不新建文件**。
- 新决策独立：新决策记录新 ADR，编号递增。
- 已废弃决策：在表格中标记状态为「已废弃」，并在文件开头加废弃说明段。

## 历史决策沉淀建议

待后续调研阶段按优先级补：

| 历史决策 | 推测影响 | 优先级 |
|---|---|---|
| 自研 Widget 机制（不引入 Symfony/Laravel） | 全代码库 | 低（已稳定） |
| 支持 4 种数据库（MySQL/MariaDB/PgSQL/SQLite） | `var/Typecho/Db/Adapter/` | 低（已稳定） |
| 路由表写在 widget 注册时（`Widget\Init`） | `Widget\Init::alloc()` | 中（影响新页面接入） |
| 插件钩子通过字符串匹配（`factory()->call()`） | 全部插件 | 低（API 稳定） |
| CI 仅 `php -l` 语法检查，无单元测试 | 仓库根 | 高（OQ-002 待决策） |