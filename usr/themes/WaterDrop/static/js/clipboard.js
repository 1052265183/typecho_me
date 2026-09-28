/**
 * 通用剪贴板写入（WaterDrop 主题内部依赖）
 *
 * 为什么需要独立文件：代码块复制（copy-code.js）与整页复制（copy-page.js）都要用，
 * 兜底逻辑若各写一份必然漂移，此处为唯一实现。
 *
 * 三段式：clipboard API → 超时降级 → execCommand 兜底。
 * 超时分支不可省：ADR-001 背景 3 实测 http 下 navigator.clipboard.writeText
 * 可能「静默失败」——Promise 既不 resolve 也不 reject，此时 .catch() 永远不触发，
 * 只挂 catch 的兜底会永远等不到，按钮点了没反应。
 */
(function () {
    if (window.__WD_CLIPBOARD_JS_LOADED) {
        return;
    }
    window.__WD_CLIPBOARD_JS_LOADED = true;

    // 800ms 是个体感阈值：再慢用户就认为按钮坏了，而正常剪贴板写入通常 <100ms
    var TIMEOUT_MS = 800;

    /**
     * execCommand 兜底。用隐藏 textarea + 选中 + 复制。
     * readonly 避免 iOS 聚焦时弹键盘；left 移出视口但不能 display:none，否则无法选中。
     */
    function execCommandCopy(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();

        var ok = false;
        try {
            ok = document.execCommand("copy");
        } catch (err) {
            ok = false;
        }
        document.body.removeChild(ta);
        return ok;
    }

    /**
     * 写入剪贴板，返回 Promise<boolean> 表示是否最终成功。
     * 无论走哪条路径都 resolve（不 reject），调用方无需写错误分支。
     */
    function writeClipboard(text) {
        return new Promise(function (resolve) {
            if (!text) {
                resolve(false);
                return;
            }

            // 非安全上下文（http 部署）下 navigator.clipboard 整个不存在，
            // 直接调 writeText 会抛 TypeError，必须先判存在性
            if (!navigator.clipboard || !navigator.clipboard.writeText) {
                resolve(execCommandCopy(text));
                return;
            }

            var settled = false;
            var timer = setTimeout(function () {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(execCommandCopy(text));
            }, TIMEOUT_MS);

            navigator.clipboard.writeText(text).then(function () {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                resolve(true);
            }).catch(function () {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                resolve(execCommandCopy(text));
            });
        });
    }

    window.__wdWriteClipboard = writeClipboard;
})();
