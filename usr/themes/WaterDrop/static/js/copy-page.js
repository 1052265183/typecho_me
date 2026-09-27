/**
 * 整页内容复制按钮（右下角悬浮，back-to-top 上方）
 * 事件委托绑在 document 上：按钮 HTML 在 #main 内（PJAX 换页区域），
 * 委托保证整页/PJAX 切页后新按钮都能触发。
 * 复制目标：当前 .markdown-body 的 innerText（代码块保留缩进换行）。
 * 兼容：优先 Clipboard API（https/localhost 安全上下文），http 下降级 execCommand。
 * 视觉反馈：按钮变绿对勾 2s + 正文短暂高亮 flash。
 */
(function () {
  if (window.__COPY_PAGE_JS_LOADED) return;
  window.__COPY_PAGE_JS_LOADED = true;

  var state = { copying: false };

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (err) {}
    document.body.removeChild(ta);
    done();
  }

  function onCopied(btn, md, icon) {
    try {
      btn.classList.add("is-copied");
      if (icon) {
        icon.classList.remove("icon-copy");
        icon.classList.add("icon-duihao", "text-success");
      }
      md.classList.remove("copy-flash");
      void md.offsetWidth;
      md.classList.add("copy-flash");
      setTimeout(function () {
        btn.classList.remove("is-copied");
        if (icon) {
          icon.classList.remove("icon-duihao", "text-success");
          icon.classList.add("icon-copy");
        }
        md.classList.remove("copy-flash");
      }, 2000);
    } catch (err) {
      console.error("copy-page onCopied failed:", err);
    }
  }

  function handleCopyPage(btn) {
    if (state.copying) return;
    state.copying = true;
    btn.dataset.copied = "1";

    var md = document.querySelector(".markdown-body");
    if (!md) {
      state.copying = false;
      btn.dataset.copied = "";
      return;
    }
    var text = md.innerText || md.textContent || "";
    var icon = btn.querySelector("i");

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        onCopied(btn, md, icon);
        state.copying = false;
        btn.dataset.copied = "";
      }).catch(function () {
        fallbackCopy(text, function () {
          onCopied(btn, md, icon);
          state.copying = false;
          btn.dataset.copied = "";
        });
      });
    } else {
      fallbackCopy(text, function () {
        onCopied(btn, md, icon);
        state.copying = false;
        btn.dataset.copied = "";
      });
    }
  }

  // 事件委托：点击冒泡到 document，取 .copy-page-btn
  document.addEventListener("click", function (e) {
    var btn = null;
    if (e.target && e.target.closest) {
      btn = e.target.closest(".copy-page-btn");
    }
    if (btn) handleCopyPage(btn);
  });

  // 页面初始加载时若按钮已存在，直绑一次（委托 + 直绑双保险）
  document.querySelectorAll(".copy-page-btn").forEach(function (b) {
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      handleCopyPage(b);
    });
  });

  // 暴露到 window 便于调试
  window.__handleCopyPage = handleCopyPage;
})();
