# ADR-001: WaterDrop 复制按钮与 PJAX 脚本注入架构

**状态**：已采纳
**日期**：2026-09-27

## 背景

需求：文章详情页（`post.php` 渲染）提供两级复制能力——每个代码块右上角"复制该段代码"按钮 + 右下角悬浮"复制整页正文"按钮（点击后按钮变绿对勾、正文蓝色高亮 flash，2 秒还原）。

实现过程中暴露三个约束，构成本次决策的背景：

1. **WaterDrop 主题启用 PJAX**（`static/js/pjax.min.js`，selectors 只替换 `title/meta[charset]/header/#main`）。`footer.php` 的内联 `<script>` 只在**整页加载**时执行一次；从首页点进文章（PJAX 换页）时，`#main` 内 DOM 全部重建，但内联脚本不重跑——新页面的 `<pre>` 不会被注入按钮（故障：点击进入无按钮，刷新才有）。
2. **内联 script 块的语法错误会连坐整块**：一次编辑误删了内联块末尾的 `</script>` 闭合标签，浏览器把后续 `</body></html>` 也当 JS 解析，整块语法错误不执行 → `#loader` 的 `hidden` class 没加上、`#body`（header.php 内联 `style="display: none;"`）没被打开 → 全页卡死在"数 据 加 载 中 ..."。`php -l` 只查 PHP 语法查不出此类问题；`window.addEventListener('error')` 在 agent-browser eval 环境下因注册时机也抓不到。
3. **http 环境下 Clipboard API 不可靠**：`window.isSecureContext` 为 true，但 `navigator.clipboard.writeText` 可能静默失败（Promise 既不 resolve 也不 reject），按钮点击后无任何视觉反馈。

## 决策

1. **代码块复制按钮：注入逻辑抽函数 + PJAX 重跑**。`injectCopyButtons()` 遍历 `.markdown-body pre`，为每个含 `<code>` 的块注入 `.copy-code-btn`；整页加载调一次，`pjax:complete` 事件里再调一次；已注入的 `<pre>`（`pre.querySelector(".copy-code-btn")` 命中）直接跳过，防重复。
2. **整页复制逻辑：独立文件 + IIFE 防重**。新建 `static/js/copy-page.js`，IIFE 首行挂 `window.__COPY_PAGE_JS_LOADED` 标记防重复加载；`footer.php` 用 `<script src>` 引入（紧跟 `pjax.min.js` 之后）。复制目标为 `.markdown-body` 的 `innerText`（保留代码块缩进与换行）。
3. **事件绑定：document 级事件委托为主**。`document.addEventListener("click", e => e.target.closest(".copy-page-btn"))`——按钮 HTML 在 `#main` 内（PJAX 换页区），委托挂在 document 上永存，换页零成本；页面初始再对已存在按钮直绑一次（双保险）。
4. **剪贴板写入：API 优先 + execCommand 兜底**。`navigator.clipboard.writeText(text).then(成功反馈).catch(降级)`；降级路径用隐藏 `textarea`（`position:fixed; left:-9999px`）+ `document.execCommand("copy")`，保证 http 开发环境可用。
5. **防卡死防线：loader/body 处置前置 + null 保护**。内联脚本开头先无条件（均带 `if (el)` 判断）执行 `loader.classList.add("hidden")` 与 `body.style.display = "block"`，之后再做 loader 动画延迟赋值、Pjax 实例化等其余逻辑——后续任何一行报错都不再阻塞首屏显示。
6. **视觉反馈**：复制成功 → 按钮加 `is-copied`（背景变 `#198754` 绿）+ 图标换 `icon-duihao text-success`；正文加 `copy-flash` class 触发 outline+背景色 keyframe（1.2s），重播前 `void md.offsetWidth` 强制 reflow；2 秒后全部还原。

## 备选

- **备选 A：全部逻辑留在 footer.php 内联** —— 否决。内联块内任何一处语法错误（少 `}`、丢 `</script>`）都导致整块不执行，且 `php -l` 查不出、error 监听抓不到，排查成本极高（本次实测数小时）；独立文件语法错误只影响自身，DevTools 直接给出行号。
- **备选 B：每个按钮直绑监听 + pjax:complete 后重绑** —— 否决。事件委托只需绑一次 document，PJAX 换页零维护；直绑方案每次换页都要重新遍历绑定，且容易漏。
- **备选 C：仅用 `navigator.clipboard`** —— 否决。http 部署（本地开发 `localhost:8000`）下静默失败，无兜底则功能不可用且无报错。
- **备选 D：去掉 loader/body 的 JS 显隐、改 CSS 默认可见** —— 否决。会改掉主题原有的"数据加载中"动画设计，影响面超出本次需求；null 保护前置已达成防卡死目标。

## 影响

- **文件范围**（均在 `usr/themes/WaterDrop/` 内，不触碰核心 `var/`）：
  - `post.php`：`<article>` 顶部新增 `.copy-page-btn` 按钮 HTML；
  - `footer.php`：新增 `<script src copy-page.js>`；`injectCopyButtons()` 抽函数 + `pjax:complete` 重调；loader/body 处置前置且带 null 保护；
  - `static/js/copy-page.js`：新增（整页复制逻辑）；
  - `static/css/common.css`：新增 `.copy-page-btn` / `.is-copied` / `.copy-flash` 三组样式。
- **兼容性**：http / https 均可用；PJAX 直达与刷新两种进入路径按钮均出现；不影响其他主题与核心代码。
- **后续主题开发约定**：本次沉淀出 4 条「主题 PJAX 脚本纪律」（注入抽函数 / 复杂逻辑外置 + 委托 / 首屏 fail-open / 浏览器实测），行动指令的权威版本在 CLAUDE.md §3——本 ADR 记录决策与理由，细则以 CLAUDE.md 为单一信源。
- **验证方式**：agent-browser 整页打开 → eval 断言 `{loaderHidden:true, bodyDisplay:"block", jsLoaded:true, 点击后 isCopied:true, flash:true}`。
