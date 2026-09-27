<?php if (!defined('__TYPECHO_ROOT_DIR__')) exit; ?>

</div><!-- end .row -->
</div>
</div><!-- end #body -->
<div class="back-to-top"><i class="iconfont icon-up"></i></div>
<footer id="footer" role="contentinfo" class="bg-white mt-3 shadow position-relative bottom-0">
    <div class="container text-secondary text-center p-3 small">
        <p class="m-0">
            &copy; <?php echo date('Y'); ?> All rights reserved.
            <?php if ($this->options->beian) : ?>
                <a class="link-secondary link-offset-2 link-underline-opacity-0 link-underline-opacity-75-hover ms-3" href="http://beian.miit.gov.cn" target="_blank"><?php $this->options->beian() ?></a>
            <?php endif; ?>
        </p>
        <p class="m-0">
            Powered by <a class="link-secondary link-offset-2 link-underline-opacity-0 link-underline-opacity-75-hover" href="http://typecho.org" target="_blank">Typecho</a>
            Theme by <a class="link-secondary link-offset-2 link-underline-opacity-0 link-underline-opacity-75-hover" href="https://ilaozhu.com/archives/2069" target="_blank">WaterDrop</a>
        </p>
    </div>
</footer><!-- end #footer -->
<script src="<?php $this->options->themeUrl('static/js/pjax.min.js'); ?>"></script>
<script src="<?php $this->options->themeUrl('static/js/copy-page.js'); ?>"></script>
<?php
$googleAd = getGoogleAd();
if ($googleAd['showAd']) : ?>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-<?= $googleAd['publisher']; ?>" crossorigin="anonymous"></script>
<?php endif; ?>
<?php $this->footer(); ?>
<?php
if ($this->options->footerJs) {
    $this->options->footerJs();
}
?>
<script>
    const loader = document.querySelector("#loader");
    const body = document.querySelector("#body");

    // 先强制显示 body 并隐藏 loader，避免 JS 后续报错时页面卡在"数据加载中"
    if (loader) {
        loader.classList.add("hidden");
    }
    if (body) {
        body.style.display = "block";
    }

    if (loader) {
        const loaderSpans = loader.children;
        for (let i = 0; i < loaderSpans.length; i++) {
            loaderSpans[i].style.animationDelay = i * 0.15 + 's';
        }
    }

    const pjax = new Pjax({
        elements: '.pjax a[href]:not([target="_blank"]):not(.no-pjax),.pjax form[action]:not(.no-pjax),a.pjax,form.pjax',
        selectors: [
            "title",
            "meta[charset]",
            "header",
            "#main"
        ],
        cacheBust: false
    });

    document.addEventListener('pjax:send', () => {
        body.style.display = "none";
        loader.classList.remove("hidden");
    });

    document.addEventListener('pjax:complete', (e) => {
        loader.classList.add("hidden");
        body.style.display = "block";
        injectCopyButtons();
    });

    window.addEventListener('click', function(e) {
        const emojiBox = document.querySelector('#emoji-box');
        const emojiBtn = document.querySelector('#emoji-btn');
        const emojiList = document.querySelector('#emoji-list');
        const textarea = document.querySelector('#textarea');
        if (emojiBtn && emojiBtn.contains(e.target)) {
            emojiList.classList.toggle('d-none');
        }

        if (emojiBox && !emojiBox.contains(e.target)) {
            emojiList.classList.add('d-none');
        }

        if (emojiList && emojiList.contains(e.target)) {
            const emoji = e.target.dataset.emoji;
            if (emoji) {
                textarea.value += emoji;
                emojiList.classList.add('d-none');
            }
        }
    });

    const backToTop = document.querySelector(".back-to-top");
    window.addEventListener('scroll', () => {
        if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
            backToTop.classList.add("show");
        } else {
            backToTop.classList.remove("show");
        }
    });

    backToTop.addEventListener("click", () => {
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    });

    /**
     * 给文章代码块注入"复制到剪贴板"按钮
     *PJAX 切页后 footer 脚本不会重跑，所以抽成函数：
     * 整页加载调用一次，pjax:complete 后再调用一次；已注入过的 pre 跳过，防重复
     */
    function injectCopyButtons() {
        const pres = document.querySelectorAll(".markdown-body pre");
        pres.forEach(pre => {
            if (pre.querySelector(".copy-code-btn")) {
                return;
            }
            const code = pre.querySelector("code");
            if (!code) {
                return;
            }
            const copyBtn = document.createElement("span");
            copyBtn.classList.add("copy-code-btn");
            copyBtn.title = "复制代码";
            const icon = document.createElement("i");
            icon.classList.add("iconfont", "icon-copy", "fs-5");
            copyBtn.appendChild(icon);
            pre.appendChild(copyBtn);
            copyBtn.addEventListener("click", () => {
                const text = code.innerText;
                navigator.clipboard.writeText(text).then(() => {
                    icon.classList.remove("icon-copy");
                    icon.classList.add("icon-duihao", "text-success");
                    setTimeout(() => {
                        icon.classList.remove("icon-duhao", "text-success");
                        icon.classList.remove("icon-duihao", "text-success");
                        icon.classList.add("icon-copy");
                    }, 2000);
                });
            });
        });
    }

    injectCopyButtons();
    </script>
</body>

</html>