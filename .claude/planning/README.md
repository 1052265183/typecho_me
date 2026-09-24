# Planning 总览

本目录按 5 个子目录组织 Typecho 项目研发过程文档。完整结构由 `CLAUDE.md §0.2 文档索引` 维护。

## 五个子目录职责

| 子目录 | 内容 | 何时读 |
|---|---|---|
| `01-需求分析/` | PRD / UE / 协议接口梳理（如 [docs.typecho.org](http://docs.typecho.org/) 的摘录、WordPress 迁移兼容性分析等） | 理解需求 / 改协议接口字段前 |
| `02-技术设计/` | `架构图.md` 模块关系图 + `ADR-README.md` ADR 索引 + `ADR-NNN-<主题>.md` 各技术决策 | 查技术决策来源 / 改架构前 |
| `03-任务拆解/` | P0 / P1 / P2 工单 + 依赖图 + 排期表 | 拆任务 / 排期 / 跟踪进度 |
| `04-开发计划/` | 版本开发计划（路线图 / 里程碑） | 规划版本 / 看进度 |
| `05-参考资料/` | 外部文档链接 + 本地参考实现索引 | 找参考实现 / 调研 |

## glossary 与 ADR 的关系

- `glossary.md` 收录领域术语（含缩写）+ OpenQ 开放问题；新术语或新缩写引入时同步追加。
- `02-技术设计/ADR-README.md` 收录已敲定的技术决策（why + 选了什么 + 否决了什么 + 影响范围），按主题分类索引；详细文件按 `ADR-NNN-<主题>.md` 命名。

## 当前状态

- 五个子目录骨架已建（含 `.gitkeep` 占位），尚未填充文档——后续调研与决策按 writing-for-agents 沉淀。
- 详见 `.claude/planning/glossary.md` 与 `.claude/planning/02-技术设计/ADR-README.md`。