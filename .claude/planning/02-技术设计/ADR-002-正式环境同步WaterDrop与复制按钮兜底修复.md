# ADR-002: 正式环境同步 WaterDrop 主题与复制按钮兜底修复

**状态**：已采纳（发布链路部分已被 [ADR-003](ADR-003-本机WSL承载正式环境替换宝塔Docker发布链路.md) 取代）
**日期**：2026-09-28
**关联**：ADR-001（复制按钮与 PJAX 脚本注入架构）、CLAUDE.md §0.6

> **2026-10-06 补注**：本 ADR 的**代码决策（决策 1~8，关于复制按钮与 PJAX 脚本架构）全部继续有效**；
> 但其中的**发布链路**——面板 Bash + base64 分块传输、每次同步前冻结快照、bind mount 改宿主机目录——
> 已随正式环境迁移到本机 WSL 而作废，改为 git pull（见 ADR-003 决策与修订段）。
> 本文按 ADR 惯例保留原文不改写，作为「当时为何那么选」的历史依据。（发布正式环境）

## 背景

需求：把本项目的 Typecho 代码同步到自建的正式环境博客（宝塔服务器 Docker 容器 `typecho_agbf-typecho_AGbF-1`）。

同步前的逐行比对（41 个 WaterDrop 文件 + 5 个核心文件哈希）得出三个事实，其中两个推翻了初始判断：

1. **通道受限**：服务器 SSH 未运行（root 配置为"仅密钥登录"但未配置任何密钥），`scp` / `rsync` 不可用，唯一写入通道是宝塔面板 Bash。代码位于宿主机 bind mount 目录（非镜像内），故改宿主机即生效、容器重建不丢。
2. **复制按钮逻辑其实已在正式环境**——初始判断"还没移过去"是错的。证据：`static/js/copy-page.js` 两边 sha256 完全一致；`post.php` 64 行**逐行 md5 全同**（`.copy-page-btn` 按钮在内）；`footer.php` 151 行中 149 行逐行相同（`injectCopyButtons()` + `pjax:complete` 重调 + `copy-page.js` 引入全在）。两处差异仅：本地第 113 行注释 `*PJAX` 少一个空格、本地第 139 行多一行拼写错误的 `remove("icon-duhao")` 冗余。
3. **真正的问题在 ADR-001 决策 4 未落地**：ADR-001 决策 4 明确要求"API 优先 + `execCommand` 兜底"、备选 C 明确否决"仅用 `navigator.clipboard`"，但 `footer.php` 的 `injectCopyButtons()` 实际只有 `navigator.clipboard.writeText(text).then(...)`，**既无 `.catch()` 降级，也无 `execCommand` 兜底**。正式环境是 http（日志 referer 均为 `http://…:22380/`），非安全上下文下 `navigator.clipboard` 为 `undefined`，代码块复制按钮点击必抛 `TypeError`——用户感知为"功能没过去"，实为"代码在但用不了"。

另有一层 ADR-001 背景 3 记录但决策 4 未覆盖的漏洞：http 下 `navigator.clipboard.writeText` 可能**静默失败（Promise 既不 resolve 也不 reject）**。此时仅靠 `.catch()` 的降级路径永远不会触发，`copy-page.js` 的 `fallbackCopy()` 同样只挂在 `.catch()` 上，故整页复制按钮也有无反馈风险。

## 决策

1. **代码块复制逻辑外置为 `static/js/copy-code.js`**。`footer.php` 中原 `injectCopyButtons()` 全部移出，内联脚本只剩一行 `<script src>` 引入。与 `copy-page.js` 形成对称结构。依据 ADR-001 备选 A：内联块任何一处语法错误会导致整块不执行且 `php -l` 查不出，独立文件只影响自身且 DevTools 直接给行号。
2. **剪贴板写入统一为三段式**：`navigator.clipboard` 存在且 `isSecureContext` 为真 → 先调 API，**同时启动超时定时器**；超时（默认 800ms）或 `.catch()` 触发 → 走 `execCommand("copy")` 降级（隐藏 `textarea` + `position:fixed; left:-9999px`）。超时分支是本决策针对 ADR-001 背景 3 的补充，覆盖 Promise 静默挂起。
3. **兜底实现独立为 `static/js/clipboard.js`**，由 `footer.php` 在两个复制脚本之前引入。`window.__wdWriteClipboard(text)` 返回 `Promise<boolean>`，无论成功与否都 resolve（不 reject），调用方无需写错误分支；两个复制脚本各自检查该全局是否存在，不存在则返回 `Promise.resolve(false)` 静默降级，不阻塞页面。独立成文件而非塞进 `copy-code.js`，是为了消除加载顺序耦合（ADR 决策 3 初稿曾写"放在 copy-code.js 内由 copy-page.js 依赖加载顺序"，实现时改为三文件对等依赖 `clipboard.js`，理由：主题文件顺序将来可能被调整或被插件插入脚本）。
4. **事件绑定统一走 document 事件委托**。代码块按钮与整页按钮都以 `e.target.closest('.copy-code-btn, .copy-page-btn')` 判定，PJAX 换页零维护。
5. **PJAX 重跑保留**：代码块注入在整页加载与 `pjax:complete` 各调一次，已注入的 `<pre>`（`pre.querySelector('.copy-code-btn')` 命中）跳过，防重复。
6. **本次以整目录覆盖方式发布 WaterDrop**（41 个文件全量对齐），不依赖差异分析，减少"漏发某个依赖文件"的风险。
7. **覆盖前做全量快照**：把远程整个 WaterDrop 目录（含 `.git`）打包进 `snapshots/20260928/`，附 `.sha256` 与 `.manifest`，沿用 `usr_plugins_20260925` 的三件套惯例。
8. **长期规范：每次同步到正式环境前必须先 grilling 决策并记录 ADR**（写入 CLAUDE.md §0.6）。理由：同步是远程写操作，范围与回滚方式每次都可能不同；grilling 固化"改什么 / 为什么 / 如何回滚"，避免凭印象覆盖生产。

## 备选

- **备选 A：只补兜底，代码块逻辑继续留在 `footer.php` 内联** —— 否决。ADR-001 备选 A 否决内联的原始理由（单点语法错误连坐整块、`php -l` 查不出、排查成本极高）在本次仍然成立；现状"部分逻辑仍在内联"正是该风险未彻底消除的残留。
- **备选 B：两套逻辑合并为单一 `copy.js`** —— 否决。会删除已上线的 `copy-page.js` 并重写，改动面与回滚复杂度显著上升，而收益仅是少一个文件；保持两文件对称更容易逐项验证。
- **备选 C：依赖远程 WaterDrop 自带的 `.git` 回滚，不额外打包** —— 否决。该仓库当前因 `dubious ownership` 无法执行 git 命令（属主与运行用户不一致），回滚路径不可靠；快照是独立于 git 之外的第二道保险。
- **备选 D：只发差异文件（`index.php` + `common.css`）** —— 否决（用户选定整目录）。逐项差异分析已验证可靠，但整目录覆盖可一并对齐本地那行笔误冗余，并避免"改了 CSS 却漏发依赖的模板"类事故。

## 影响

- **文件范围**（均在 `usr/themes/WaterDrop/` 内，不触碰核心 `var/` 与后台 `admin/`——两者已验证与本项目完全一致）：
  - 新增 `static/js/clipboard.js`：三段式剪贴板写入（API → 800ms 超时 → `execCommand`），两套复制逻辑共用；
  - 新增 `static/js/copy-code.js`：代码块复制逻辑（注入 + 委托 + PJAX 重跑），剪贴板写入委托 `clipboard.js`；
  - `footer.php`：删除内联 `injectCopyButtons()` 与 `pjax:complete` 中的调用，改为引入 `copy-code.js`；删除本地多出的 `remove("icon-duhao")` 笔误行；注释空格与远程对齐；
  - `static/js/copy-page.js`：改用共用兜底 + 补超时分支；
  - `post.php`：本次不改（与远程已逐行一致），发布时随整目录覆盖保持一致；
  - `index.php` / `static/css/common.css`：随整目录覆盖发布首页三列紧凑网格改造（提交 `9fc44c1`）。
- **兼容性**：http / https 均可��；PJAX 直达与刷新两种进入路径按钮均出现；不改核心代码与其他主题。
- **发布流程**：遵循 CLAUDE.md §0.6 五步（只读比对 → 冻结快照 → base64 分块传输 → 保留属主替换 → 浏览器实测）。发布前已完成逐行比对，发布后用 `ServerIP` 取内网地址直连 `http://<内网IP>:22380/` 实测。
- **新增缺口**：本决策修掉的缺陷此前未登记，事后补记为 `typecho-GAPS.md` G5 + 工单清单同号条目（ADR 决策已定但实现未落地，属"代码缺口"而非"待办"）。
- **后续约定**：CLAUDE.md §0.6 新增强制条款——每次同步正式环境前必须 grilling 并记录 ADR-002 之后的 ADR。
