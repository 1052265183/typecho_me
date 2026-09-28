/**
 * 代码块复制按钮（每个 <pre> 右上角「复制代码」）
 *
 * 外置原因（ADR-001 备选 A / ADR-002 决策 1）：原先逻辑内联在 footer.php，
 * 内联块任何一处语法错误会让整块不执行、整页卡在「数据加载中」，且 php -l 查不出。
 *
 * 注入时机：整页加载一次 + pjax:complete 再一次（PJAX 只替换 #main，
 * footer 内联脚本不重跑，不重调则进入文章页的 <pre> 没有按钮）。
 * 防重复：已注入的 <pre> 命中 .copy-code-btn 直接跳过。
 */
(function () {
    if (window.__COPY_CODE_JS_LOADED) {
        return;
    }
    window.__COPY_CODE_JS_LOADED = true;

    /** 剪贴板写入统一走 clipboard.js 的唯一实现，此处只做「不在则空降级」的兜底 */
    function writeClipboard(text) {
        if (window.__wdWriteClipboard) {
            return window.__wdWriteClipboard(text);
        }
        return Promise.resolve(false);
    }

    /** 成功反馈：图标换对勾，2 秒后还原（唯一一处还原，避免重复 remove 写错类名） */
    function flashIcon(icon) {
        if (!icon) {
            return;
        }
        icon.classList.remove("icon-copy");
        icon.classList.add("icon-duihao", "text-success");
        setTimeout(function () {
            icon.classList.remove("icon-duihao", "text-success");
            icon.classList.add("icon-copy");
        }, 2000);
    }

    function handleCopyCode(btn) {
        var pre = btn.closest("pre");
        var code = pre ? pre.querySelector("code") : null;
        if (!code) {
            return;
        }
        writeClipboard(code.innerText).then(function () {
            flashIcon(btn.querySelector("i"));
        });
    }

    function injectCopyButtons() {
        var pres = document.querySelectorAll(".markdown-body pre");
        Array.prototype.forEach.call(pres, function (pre) {
            if (pre.querySelector(".copy-code-btn")) {
                return;
            }
            if (!pre.querySelector("code")) {
                return;
            }
            var btn = document.createElement("span");
            btn.classList.add("copy-code-btn");
            btn.title = "复制代码";
            var icon = document.createElement("i");
            icon.classList.add("iconfont", "icon-copy", "fs-5");
            btn.appendChild(icon);
            pre.appendChild(btn);
        });
    }

    // 事件委托：按钮由 JS 注入、且随 PJAX 重建，直绑会随换页失效
    document.addEventListener("click", function (e) {
        if (!e.target || !e.target.closest) {
            return;
        }
        var btn = e.target.closest(".copy-code-btn");
        if (btn) {
            handleCopyCode(btn);
        }
    });

    injectCopyButtons();
    document.addEventListener("pjax:complete", injectCopyButtons);
})();
