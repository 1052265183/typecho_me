/**
 * TinyMCE 自定义功能 - 完整版
 * 粘贴外部图片自动下载到本地
 */

(function () {

    // 配置
    const CONFIG = {
        proxyUrl: '/usr/plugins/TinyMceForTypecho/download-proxy.php',
        uploadUrl: '/usr/plugins/TinyMceForTypecho/upload.php', // 您提供的上传接口
        progressUrl: '/usr/plugins/TinyMceForTypecho/upload.php?action=progress', // 您提供的上传接口
        replaceDelay: 1000, // 延迟扫描时间（毫秒）
        batchDelay: 1000,   // 批量处理间隔（毫秒）
        maxFileSize: 10 * 1024 * 1024 * 1024, // 最大文件大小 100MB
        maxConcurrentUploads: 3, // 最大并发上传数
        uploadRetryCount: 3, // 上传重试次数
        uploadRetryDelay: 1000, // 上传重试延迟（毫秒）
        allowedTypes: {
            // 图片类型
            'image/jpeg': { ext: 'jpg', type: 'image' },
            'image/jpg': { ext: 'jpg', type: 'image' },
            'image/png': { ext: 'png', type: 'image' },
            'image/gif': { ext: 'gif', type: 'image' },
            'image/webp': { ext: 'webp', type: 'image' },
            // 文档类型
            'application/pdf': { ext: 'pdf', type: 'document' },
            'application/msword': { ext: 'doc', type: 'document' },
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', type: 'document' },
            'application/vnd.ms-excel': { ext: 'xls', type: 'document' },
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', type: 'document' },
            'application/vnd.ms-powerpoint': { ext: 'ppt', type: 'document' },
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', type: 'document' },
            'text/plain': { ext: 'txt', type: 'document' },
            'text/html': { ext: 'html', type: 'document' },
            // 归档文件类型 - 添加以下几行
            'application/zip': { ext: 'zip', type: 'archive' },
            'application/x-rar-compressed': { ext: 'rar', type: 'archive' },
            'application/x-7z-compressed': { ext: '7z', type: 'archive' },
            'application/x-compressed': { ext: '7z', type: 'archive' }, // 添加这一行
            'application/x-zip-compressed': { ext: 'zip', type: 'archive' },
            'application/x-tar': { ext: 'tar', type: 'archive' },
            // 视频类型
            'video/mp4': { ext: 'mp4', type: 'video' },
            'video/webm': { ext: 'webm', type: 'video' },
            'video/ogg': { ext: 'ogg', type: 'video' },
            'video/avi': { ext: 'avi', type: 'video' },
            'video/mov': { ext: 'mov', type: 'video' },
            'video/wmv': { ext: 'wmv', type: 'video' },
            'video/flv': { ext: 'flv', type: 'video' },
            'video/mkv': { ext: 'mkv', type: 'video' }

        }
    };

    // 上传队列管理
    const uploadQueue = {
        queue: [],
        processing: false,
        maxConcurrent: CONFIG.maxConcurrentUploads,
        currentProcessing: 0,

        add(file, editor, callback) {
            this.queue.push({ file, editor, callback });
            if (!this.processing) {
                this.processing = true;
                this.processNext();
            }
        },

        processNext() {
            if (this.queue.length === 0) {
                this.processing = false;
                return;
            }

            if (this.currentProcessing < this.maxConcurrent) {
                const item = this.queue.shift();
                this.currentProcessing++;
                this.uploadFile(item).finally(() => {
                    this.currentProcessing--;
                    this.processNext();
                });
            }
        },

        uploadFile(item) {
            return new Promise((resolve) => {
                uploadWithRetry(item.editor, item.file, CONFIG.uploadRetryCount, CONFIG.uploadRetryDelay)
                    .then(data => {
                        if (item.callback) {
                            item.callback(true, data);
                        }
                        resolve();
                    })
                    .catch(error => {
                        if (item.callback) {
                            item.callback(false, error);
                        }
                        resolve();
                    });
            });
        }
    };

    // 批量通知管理
    class UploadNotification {
        constructor(editor, totalFiles) {
            this.editor = editor;
            this.total = totalFiles;
            this.completed = 0;
            this.failed = 0;
            this.notification = null;
            this.startTime = Date.now();
        }

        show() {
            this.notification = this.editor.notificationManager.open({
                text: `正在上传 ${this.total} 个文件... (0/${this.total})`,
                type: 'info',
                timeout: false
            });
        }

        update() {
            if (this.notification) {
                const elapsed = Math.round((Date.now() - this.startTime) / 1000);
                this.notification.text(`正在上传 ${this.total} 个文件... (${this.completed}/${this.total}) - ${elapsed}s`);
            }
        }

        complete() {
            if (this.notification) {
                this.editor.notificationManager.close(this.notification);
            }

            const successCount = this.completed - this.failed;
            if (this.failed === 0) {
                this.editor.notificationManager.open({
                    text: `✅ 成功上传 ${successCount} 个文件`,
                    type: 'success',
                    timeout: 3000
                });
            } else {
                this.editor.notificationManager.open({
                    text: `⚠️ 上传完成: ${successCount} 个成功, ${this.failed} 个失败`,
                    type: 'warning',
                    timeout: 4000
                });
            }
        }
    }

    // 带重试的上传函数
    function uploadWithRetry(editor, file, retries = 3, delay = 1000) {
        return new Promise((resolve, reject) => {
            async function attempt(attemptNumber) {
                try {
                    const data = await uploadFile(editor, file, (success, data) => {
                        if (success) {
                            resolve(data);
                        } else {
                            if (attemptNumber < retries) {
                                console.log(`上传失败，${delay}ms后重试 (${attemptNumber + 1}/${retries})`);
                                setTimeout(() => attempt(attemptNumber + 1), delay);
                            } else {
                                reject(data);
                            }
                        }
                    });
                } catch (error) {
                    if (attemptNumber < retries) {
                        console.log(`上传失败，${delay}ms后重试 (${attemptNumber + 1}/${retries})`);
                        setTimeout(() => attempt(attemptNumber + 1), delay);
                    } else {
                        reject(error);
                    }
                }
            }
            attempt(0);
        });
    }

    // 等待DOM加载完成
    document.addEventListener('DOMContentLoaded', function () {
        initTinyMCE();
    });

    function initTinyMCE() {
        if (typeof tinymce === 'undefined') {
            console.error('TinyMCE未加载');
            return;
        }

        // 初始化TinyMCE
        tinymce.init({
            selector: '#text',
            language: 'zh_CN',
            license_key: 'gpl',
            plugins: 'image accordion advlist anchor autolink autoresize autosave charmap code codesample directionality emoticons fullscreen help image importcss insertdatetime link lists media nonbreaking pagebreak preview quickbars save searchreplace table visualblocks visualchars wordcount',
            toolbar: 'image blocks | bullist numlist | image link media codesample table accordion | charmap emoticons hr | pagebreak nonbreaking anchor | insertdatetime | bold italic underline strikethrough superscript subscript codeformat | fontfamily fontsize align lineheight forecolor backcolor | removeformat | ltr rtl | undo redo | selectall searchreplace | code | visualaid visualchars visualblocks | preview fullscreen | help',
            min_height: 600,
            resize: true,
            toolbar_mode: 'sliding',
            image_advtab: true,
            importcss_append: true,
            setup: function (editor) {
                editor.on('init', function () {
                    window.currentEditor = editor;

                    // 编辑器初始化完成后修复路径
                    console.log('编辑器初始化完成，开始修复路径...');
                    setTimeout(() => {
                        fixAllSrc(editor);
                    }, 500);

                    // 监听粘贴事件 - 不阻止默认行为
                    editor.on('paste', function (e) {
                        console.log('粘贴事件触发，等待内容插入后扫描...');
                        // 延迟扫描，让编辑器先完成粘贴
                        setTimeout(() => {
                            scanAndReplaceExternalImages(editor);
                        }, CONFIG.replaceDelay);
                        // 检查剪贴板数据
                        const clipboardData = e.clipboardData || window.clipboardData;
                        const items = clipboardData.items;

                        if (!items) {
                            console.log('无法访问剪贴板数据');
                            return;
                        }

                        // 收集所有文件
                        const files = [];
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            if (item.kind === 'file') {
                                const file = item.getAsFile();
                                if (file) {
                                    files.push(file);
                                }
                            }
                        }

                        // 批量处理文件
                        if (files.length > 0) {
                            handleMultipleFiles(editor, files);
                        }
                    });

                    // 监听拖放事件
                    editor.on('drop', function (e) {
                        if (e.dataTransfer && e.dataTransfer.files) {
                            e.preventDefault();
                            // handleDroppedFiles(editor, e.dataTransfer.files);
                        }
                    });

                    editor.on('dragover', function (e) {
                        e.preventDefault();
                    });

                    // 监听内容变化，自动替换外部图片
                    editor.on('change', function () {
                        console.log('编辑器内容变化');
                        fixAllSrc(editor);
                    });

                });
            }
        });

    }

    // 修复指定标签中的data-mce-p-src路径
    function fixDataMcePSrcPaths(container, selector, label) {
        const elements = container.querySelectorAll(selector);
        console.log(`找到 ${elements.length} 个${label}`);

        elements.forEach((element, index) => {
            const dataMcePSrc = element.getAttribute('data-mce-p-src');
            if (dataMcePSrc && dataMcePSrc.startsWith('../usr')) {
                // 修复路径，将 ../usr 改为 /usr
                const fixedSrc = dataMcePSrc.replace('../usr', '/usr');
                element.setAttribute('data-mce-p-src', fixedSrc);
                console.info(`${label} ${index + 1}: 修复路径 ${dataMcePSrc} -> ${fixedSrc}`);

                // 如果是视频预览对象，同时修复内部视频标签的src属性
                if (selector.includes('mce-object-video')) {
                    const video = element.querySelector('video');
                    if (video) {
                        const videoSrc = video.getAttribute('src');
                        if (videoSrc && videoSrc.startsWith('../usr')) {
                            const fixedVideoSrc = videoSrc.replace('../usr', '/usr');
                            video.setAttribute('src', fixedVideoSrc);
                            console.info(`${label} ${index + 1}: 修复视频src ${videoSrc} -> ${fixedVideoSrc}`);
                        }
                    }
                }
            }
        });
    }

    function fixAllSrc(editor) {
        const tempDiv = editor.getBody();
        fixDataMcePSrcPaths(tempDiv, 'span.mce-preview-object.mce-object-video', '视频对象');
        fixDataMcePSrcPaths(tempDiv, 'a[data-mce-p-src]', '带data-mce-p-src的链接');
    }
    
    // 检查是否为支持的文件类型
    function isSupportedFile(file) {
        return true;
    }
    function handleFile(editor, file) {
        // 检查文件大小
        if (file.size > CONFIG.maxFileSize) {
            editor.notificationManager.open({
                text: `文件太大，最大支持 ${CONFIG.maxFileSize / 1024 / 1024 / 1024}MB`,
                type: 'error',
                timeout: 3000
            });
            return;
        }

        // 检查文件类型
        if (!isSupportedFile(file)) {
            console.log('不支持的文件类型', file);
            editor.notificationManager.open({
                text: `不支持的文件类型: ${file.type}`,
                type: 'error',
                timeout: 10000
            });
            return;
        }

        // 上传文件
        uploadQueue.add(file, editor, (success, data) => {
            if (success) {
                // 根据文件类型插入不同的内容
                if (isVideoFile(file)) {
                    // 视频文件：插入视频控件
                    const videoHtml = `<video src="${data.url}" controls width="600" height="400" data-mce-src="${data.url}" data-mce-p-src="${data.url}"></video>`;
                    editor.insertContent(videoHtml);
                } else if (!isImageFile(file)) {
                    // 其他文件：插入链接
                    const linkHtml = `<a href="${data.url}" data-mce-href="${data.url}" data-mce-p-src="${data.url}" target="_blank">${file.name}</a>`;
                    editor.insertContent(linkHtml);
                }
                editor.dispatch('change');
                console.log(`${isVideoFile(file) ? '视频' : (isImageFile(file) ? '图片' : '文件')}上传成功`, data);

                editor.notificationManager.open({
                    text: `${isVideoFile(file) ? '视频' : (isImageFile(file) ? '图片' : '文件')}上传成功`,
                    type: 'success',
                    timeout: 2000
                });
            } else {
                console.log(`上传失败`, data);
                editor.notificationManager.open({
                    text: '上传失败: ' + data,
                    type: 'error',
                    timeout: 3000
                });
            }
        });
    }

    // 批量处理文件
    function handleMultipleFiles(editor, files) {
        const totalFiles = files.length;
        const notification = new UploadNotification(editor, totalFiles);
        notification.show();

        let completed = 0;
        let failed = 0;

        files.forEach((file, index) => {
            // 检查文件大小和类型
            if (file.size > CONFIG.maxFileSize) {
                console.log('文件太大', file.name);
                failed++;
                completed++;
                notification.update();
                if (completed === totalFiles) {
                    notification.complete();
                }
                return;
            }

            if (!isSupportedFile(file)) {
                console.log('不支持的文件类型', file.name);
                failed++;
                completed++;
                notification.update();
                if (completed === totalFiles) {
                    notification.complete();
                }
                return;
            }

            // 上传文件
            uploadQueue.add(file, editor, (success, data) => {
                if (success) {
                    console.log('文件上传成功', file.name, data);
                    // 根据文件类型插入不同的内容
                    if (isVideoFile(file)) {
                        // 视频文件：插入视频控件
                        const videoHtml = `<video src="${data.url}" controls width="600" height="400" data-mce-src="${data.url}" data-mce-p-src="${data.url}"></video>`;
                        // 保持顺序插入
                        setTimeout(() => {
                            editor.insertContent(videoHtml);
                        }, index * 100);
                    } else if (!isImageFile(file)) {
                        // 其他文件：插入链接
                        const linkHtml = `<a href="${data.url}" data-mce-href="${data.url}" data-mce-p-src="${data.url}" target="_blank">${file.name}</a>`;
                        // 保持顺序插入
                        setTimeout(() => {
                            editor.insertContent(linkHtml);
                        }, index * 100);
                    }
                    console.log(`${isVideoFile(file) ? '视频' : (isImageFile(file) ? '图片' : '文件')}上传成功`, file.name);
                } else {
                    console.log(`上传失败`, file.name, data);
                    failed++;
                }

                completed++;
                notification.update();

                if (completed === totalFiles) {
                    editor.dispatch('change');
                    notification.complete();
                }
            });
        });
    }

    const extractPath = (urlString) => {
        const match = urlString.match(/\/usr\/uploads\/(.+)/);
        return match ? match[1] : null;
    };

    // 核心函数：扫描并替换外部图片
    function scanAndReplaceExternalImages(editor) {
        const content = editor.getContent();
        console.log('🔍 开始扫描外部图片...');

        if (!content) {
            console.log('编辑器内容为空');
            return;
        }

        // 创建临时DOM解析
        const tempDiv = editor.getBody();

        // 查找所有img标签
        const images = tempDiv.querySelectorAll('img');
        console.log(`找到 ${images.length} 张图片`);

        if (images.length === 0) {
            console.log('没有发现图片');
            return;
        }

        // 收集需要处理的外部图片
        const externalImages = [];

        images.forEach((img, index) => {
            let src = img.src || img.getAttribute('data-src');
            console.log(`图片 ${index + 1}: src: ${src}`);
            if (!src) return;
            // 检查是否是base64图片
            if (src.startsWith('data:image/')) {
                console.log(`图片 ${index + 1}: 发现base64图片，需要转换为本地图片`);
                // 转换base64为文件并上传
                convertBase64ToFileAndUpload(editor, src, img);
                return;
            }

            // 检查是否是blob图片
            if (src.startsWith('blob:')) {
                console.log(`图片 ${index + 1}: 发现blob图片，需要转换为本地图片`);
                // 转换blob为文件并上传
                convertBlobUrlToFileAndUpload(editor, src, img);
                return;
            }

            if (extractPath(src)) {
                src = "/usr/uploads/" + extractPath(src);
                img.src = src;
                img.setAttribute('data-src', src);
                img.setAttribute('data-mce-src', src);
                console.info(`图片 ${index + 1}: 重置为${src}`);
            }
            // 跳过已处理或正在处理的图片
            if (img.hasAttribute('data-processed') || img.hasAttribute('data-processing')) {
                console.info(`图片 ${index + 1}: 已处理或正在处理，跳过`);
                return;
            }

            // 判断是否是外部图片
            if (isExternalImage(src)) {
                console.log(`图片 ${index + 1}: 发现外部图片`, src.substring(0, 100));
                externalImages.push({
                    element: img,
                    src: src,
                    index: index
                });
            } else {
                console.log(`图片 ${index + 1}: 本地图片，跳过`);
            }
        });

        if (externalImages.length === 0) {
            console.log('没有发现需要处理的外部图片');
            return;
        }

        console.log(`发现 ${externalImages.length} 张外部图片需要处理`);

        // 显示处理通知
        const notification = editor.notificationManager.open({
            text: `正在处理 ${externalImages.length} 张外部图片...`,
            type: 'info',
            timeout: false
        });

        // 批量处理外部图片
        batchProcessImages(editor, externalImages, notification);
        
        // 处理视频标签和链接标签中的data-mce-p-src路径
        fixAllSrc(editor);
    }

    // 修复指定标签中的data-mce-p-src路径
    function fixDataMcePSrcPaths(container, selector, label) {
        const elements = container.querySelectorAll(selector);
        console.log(`找到 ${elements.length} 个${label}`);

        elements.forEach((element, index) => {
            const dataMcePSrc = element.getAttribute('data-mce-p-src');
            if (dataMcePSrc && dataMcePSrc.startsWith('../usr')) {
                // 修复路径，将 ../usr 改为 /usr
                const fixedSrc = dataMcePSrc.replace('../usr', '/usr');
                element.setAttribute('data-mce-p-src', fixedSrc);
                console.info(`${label} ${index + 1}: 修复路径 ${dataMcePSrc} -> ${fixedSrc}`);

                // 如果是视频预览对象，同时修复内部视频标签的src属性
                if (selector.includes('mce-object-video')) {
                    const video = element.querySelector('video');
                    if (video) {
                        const videoSrc = video.getAttribute('src');
                        if (videoSrc && videoSrc.startsWith('../usr')) {
                            const fixedVideoSrc = videoSrc.replace('../usr', '/usr');
                            video.setAttribute('src', fixedVideoSrc);
                            console.info(`${label} ${index + 1}: 修复视频src ${videoSrc} -> ${fixedVideoSrc}`);
                        }
                    }
                }
            }
        });
    }
    // 批量处理图片
    function batchProcessImages(editor, images, notification) {
        let processed = 0;
        const total = images.length;

        console.log(`开始批量处理 ${total} 张图片`);

        // 处理每张图片
        images.forEach((imgInfo, index) => {
            // 延迟处理，避免请求过多
            setTimeout(() => {
                processSingleImage(editor, imgInfo, (success) => {
                    processed++;

                    // 更新进度
                    const progress = Math.round((processed / total) * 100);
                    console.log(`进度: ${processed}/${total} (${progress}%)`);

                    // 所有图片处理完成
                    if (processed === total) {
                        setTimeout(() => {
                            editor.notificationManager.close(notification);

                            // 最终确认编辑器内容
                            finalCheckEditorContent(editor);

                            // 统计成功数量
                            const successCount = countSuccessImages(editor);
                            const failCount = total - successCount;

                            if (failCount === 0) {
                                editor.notificationManager.open({
                                    text: `✅ 成功处理 ${successCount} 张外部图片`,
                                    type: 'success',
                                    timeout: 3000
                                });
                            } else {
                                editor.notificationManager.open({
                                    text: `⚠️ 处理完成: ${successCount} 张成功, ${failCount} 张失败`,
                                    type: 'warning',
                                    timeout: 4000
                                });
                            }
                        }, 1000);
                    }
                });
            }, index * CONFIG.batchDelay);
        });
    }

    // 处理单张图片
    function processSingleImage(editor, imgInfo, callback) {
        const { element, src } = imgInfo;

        console.log(`处理图片: ${src.substring(0, 80)}...`);

        // 标记原图为正在处理
        element.setAttribute('data-processing', 'true');
        element.setAttribute('data-original-src', src);

        // 添加处理中样式
        element.style.opacity = '0.7';
        element.style.filter = 'blur(2px)';
        element.title = '正在下载到本地...';

        // 通过代理下载图片
        downloadImageViaProxy(src, (error, localUrl) => {
            if (error) {
                console.error(`下载失败:`, error);

                // 恢复原图样式
                element.style.opacity = '1';
                element.style.filter = 'none';
                element.title = element.title || '';
                element.setAttribute('data-processed', 'failed');
                element.setAttribute('data-error', error);
                element.removeAttribute('data-processing');

                callback(false);
            } else {
                console.log(`✅ 下载成功:`, localUrl);
                var newImg = replaceImg(element, localUrl, src);
                // 关键步骤：更新编辑器内容
                updateImageInEditor(editor, src, localUrl, element, newImg);

                callback(true);
            }
        });
    }


    function replaceImg(element, localUrl, src) {
        // 创建新图片元素
        const newImg = document.createElement('img');

        // 设置新图片的属性
        newImg.src = localUrl;
        newImg.setAttribute('data-mce-src', localUrl);
        newImg.setAttribute('data-mce-p-src', localUrl);
        newImg.setAttribute('data-processed', 'success');
        newImg.setAttribute('data-original-src', src); // 保留原始URL记录

        // 恢复原图样式和属性
        newImg.style.cssText = element.style.cssText;
        newImg.className = element.className;
        newImg.alt = element.alt || '';
        newImg.title = element.title || '';

        // 设置尺寸max-width: 100%
        newImg.style.maxWidth = "100%";
        newImg.style.height = "auto";
        element.getAttributeNames().forEach(name => {
            if (!name.startsWith('data-') && name !== 'src' && name !== 'data-mce-src' && name !== 'data-mce-p-src') {
                newImg.setAttribute(name, element.getAttribute(name));
            }
        });

        // 在DOM中替换原图
        const parent = element.parentElement;
        if (parent) {
            parent.insertBefore(newImg, element);
            parent.removeChild(element);
            console.log('✅ 成功创建新图片替换原图');
        }
        return newImg;
    }

    // 通过代理下载图片
    function downloadImageViaProxy(imageUrl, callback) {
        console.log(`📥 下载: ${imageUrl.substring(0, 100)}`);

        const formData = new FormData();
        formData.append('url', imageUrl);

        fetch(CONFIG.proxyUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        })
            .then(response => response.json())
            .then(data => {
                console.info("downloadImageViaProxy 响应:", data);
                if (data.success && data.url) {
                    callback(null, data.url);
                } else {
                    callback(data.error || '下载失败');
                }
            })
            .catch(error => {
                callback('网络错误: ' + error.message);
            });
    }

    // 更新编辑器中的图片
    function updateImageInEditor(editor, oldSrc, localUrl, oldElement, newElement) {
        console.info(`🔄 更新编辑器图片: ${oldSrc.substring(0, 80)} -> ${localUrl}`);

        // 方法1: 直接操作编辑器DOM
        try {
            const editorBody = editor.getBody();
            if (editorBody) {
                // 查找所有img元素
                const editorImages = editorBody.querySelectorAll('img');
                let replaced = false;

                editorImages.forEach(img => {
                    const src = img.src || img.getAttribute('data-src');
                    if (src === oldSrc && img !== newElement) {
                        // 在DOM中替换
                        if (img.parentElement) {
                            img.parentElement.insertBefore(newElement, img);
                            img.parentElement.removeChild(img);
                            replaced = true;
                            console.log(`✅ 通过DOM操作更新图片: ${oldSrc.substring(0, 50)}`);
                        }
                    }
                });

                if (replaced) {
                    // 触发change事件
                    setTimeout(() => {
                        editor.dispatch('change');
                    }, 100);
                    return;
                }
            }
        } catch (e) {
            console.warn("直接操作编辑器DOM失败:", e);
        }

        // 方法2: 通过正则替换整个HTML内容
        const content = editor.getContent();
        if (!content.includes(oldSrc)) {
            console.log(`内容中未找到旧URL: ${oldSrc}`);
            return;
        }

        const regex = new RegExp(`(<img[^>]*src=["']?)${escapeRegExp(oldSrc)}(["'][^>]*>)`, 'gi');
        let newContent = content;
        let matchCount = 0;

        newContent = newContent.replace(regex, (match, prefix, suffix) => {
            matchCount++;
            // 构建新的img标签
            let newImgTag = match.replace(`src="${oldSrc}"`, `src="${localUrl}"`);
            newImgTag = newImgTag.replace(`src='${oldSrc}'`, `src='${localUrl}'`);

            // 确保有data-mce-src属性
            if (!newImgTag.includes('data-mce-src')) {
                newImgTag = newImgTag.replace('>', ` data-mce-src="${localUrl}" data-mce-p-src="${localUrl}" data-processed="success">`);
            } else if (!newImgTag.includes('data-mce-p-src')) {
                // 确保有data-mce-p-src属性
                newImgTag = newImgTag.replace('data-mce-src="' + localUrl + '"', 'data-mce-src="' + localUrl + '" data-mce-p-src="' + localUrl + '"');
            }

            return newImgTag;
        });

        if (matchCount > 0) {
            editor.setContent(newContent);
            editor.dispatch('change');
            console.log(`✅ 通过正则替换更新了 ${matchCount} 处图片URL`);
        }
    }

    // 判断是否是外部图片
    function isExternalImage(url) {
        if (!url) return false;

        // 跳过数据URL、blob URL和本地文件URL
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('file:')) {
            return false;
        }

        // 检查是否是图片文件
        if (!url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i)) {
            // 对于没有扩展名的URL，检查是否是外部链接
            try {
                const urlObj = new URL(url);
                const currentHost = window.location.hostname;

                // 如果是当前域名或本地地址，则认为是本地图片
                if (urlObj.hostname === currentHost ||
                    !urlObj.hostname ||
                    urlObj.hostname === 'localhost' ||
                    urlObj.hostname === '127.0.0.1') {
                    return false;
                }

                return true;
            } catch (e) {
                // URL解析失败，可能是相对路径
                return false;
            }
        }

        // 判断是否是外部URL
        try {
            const urlObj = new URL(url);
            const currentHost = window.location.hostname;
            console.info("currentHost:", currentHost);

            // 如果是当前域名或本地地址，则认为是本地图片
            if (urlObj.hostname === currentHost ||
                !urlObj.hostname ||
                urlObj.hostname === 'localhost' ||
                urlObj.hostname === '127.0.0.1') {
                return false;
            }

            return true;
        } catch (e) {
            // URL解析失败，可能是相对路径
            return false;
        }
    }

    // 最终检查编辑器内容
    function finalCheckEditorContent(editor) {
        // 等待一段时间确保所有DOM更新完成
        setTimeout(() => {
            const content = editor.getContent();
            console.log("📊 最终编辑器内容长度:", content.length);

            // 检查是否还有未处理的外部图片
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;
            const allImages = tempDiv.querySelectorAll('img');
            const externalImages = [];

            allImages.forEach((img, index) => {
                const src = img.src;
                if (src && isExternalImage(src) && !img.hasAttribute('data-processed')) {
                    externalImages.push({ src: src, index: index });
                }
            });

            if (externalImages.length > 0) {
                console.warn("⚠️ 警告：发现未处理的外部图片:", externalImages.length);
                externalImages.forEach(img => {
                    console.warn(`  - 图片 ${img.index + 1}: ${img.src.substring(0, 80)}`);
                });

                // 如果有未处理的图片，重新扫描一次
                setTimeout(() => {
                    console.log("🔄 重新扫描未处理的外部图片...");
                    scanAndReplaceExternalImages(editor);
                }, 2000);
            } else {
                console.log("✅ 所有外部图片已处理完成");
            }

            // 检查Typecho可能读取的textarea内容
            const textarea = document.querySelector('#text');
            if (textarea) {
                console.log("📝 Typecho textarea内容长度:", textarea.value.length);
                console.log("🔗 是否包含本地URL:", textarea.value.includes('/usr/uploads/'));

                // 如果textarea内容不包含本地URL，强制同步
                if (!textarea.value.includes('/usr/uploads/') && content.includes('/usr/uploads/')) {
                    console.log("🔄 强制同步textarea内容...");
                    textarea.value = content;
                }
            }

            // 强制触发change事件
            editor.dispatch('change');
        }, 500);
    }

    // 统计成功处理的图片数量
    function countSuccessImages(editor) {
        const content = editor.getContent();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;

        const successImages = tempDiv.querySelectorAll('img[data-processed="success"]');
        return successImages.length;
    }

    // 处理拖放的文件
    function handleDroppedFiles(editor, files) {
        Array.from(files).forEach(file => {
            if (file.type.indexOf('image') !== -1) {
                uploadLocalImage(editor, file);
            }
        });
    }


    // 辅助函数：转义正则表达式特殊字符
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 将 Blob URL 转换为文件对象并上传
     * @param {Object} editor - TinyMCE 编辑器实例
     * @param {string} blobUrl - Blob URL 字符串
     * @param {string} altText - 图片替代文本
     */
    async function convertBlobUrlToFileAndUpload(editor, blobUrl, imgElement) {
        try {
            // 获取 Blob 对象
            const response = await fetch(blobUrl);
            const blob = await response.blob();

            // 检查 Blob 类型是否为图片
            if (!blob.type || !blob.type.startsWith('image/')) {
                console.error('Blob URL 不是有效的图片类型:', blob.type);
                editor.notificationManager.open({
                    text: '粘贴的内容不是有效的图片',
                    type: 'error',
                    timeout: 3000
                });
                return;
            }

            // 检查文件大小
            if (blob.size > CONFIG.maxFileSize) {
                console.error(`文件太大: ${blob.size} bytes`);
                editor.notificationManager.open({
                    text: `文件太大，最大支持 ${CONFIG.maxFileSize / 1024 / 1024}MB`,
                    type: 'error',
                    timeout: 3000
                });
                return;
            }

            // 获取文件扩展名
            const fileInfo = CONFIG.allowedTypes[blob.type];
            if (!fileInfo || fileInfo.type !== 'image') {
                console.error('不支持的图片类型:', blob.type);
                editor.notificationManager.open({
                    text: `不支持的图片类型: ${blob.type}`,
                    type: 'error',
                    timeout: 3000
                });
                return;
            }

            const ext = fileInfo.ext;
            const fileName = `screenshot_${Date.now()}.${ext}`;
            const file = new File([blob], fileName, { type: blob.type });

            // 上传文件
            uploadFile(editor, file, (success, data) => {
                if (success) {
                    console.log("📊 截图上传成功:", data.url);
                    replaceImg(imgElement, data.url, data.url);

                    // 更新编辑器内容
                    editor.dispatch('change');

                    editor.notificationManager.open({
                        text: '图片上传成功',
                        type: 'success',
                        timeout: 2000
                    });
                } else {
                    editor.notificationManager.open({
                        text: '图片上传失败: ' + data,
                        type: 'error',
                        timeout: 3000
                    });
                }
            });

        } catch (error) {
            console.error('转换 Blob URL 失败:', error);
            editor.notificationManager.open({
                text: '处理图片时出错: ' + error.message,
                type: 'error',
                timeout: 3000
            });
        }
    }
    // 转换base64为文件并上传
    function convertBase64ToFileAndUpload(editor, base64Data, imgElement) {
        // 提取MIME类型和base64数据
        const mimeMatch = base64Data.match(/^data:(.+);base64,/);
        if (!mimeMatch) {
            console.error('无法识别base64格式');
            return;
        }

        const mimeType = mimeMatch[1];
        const base64Content = base64Data.replace(/^data:.+;base64,/, '');

        // 检查MIME类型是否支持
        if (!CONFIG.allowedTypes[mimeType] || CONFIG.allowedTypes[mimeType].type !== 'image') {
            console.error(`不支持的MIME类型: ${mimeType}`);
            return;
        }

        // 将base64转换为Blob
        const byteCharacters = atob(base64Content);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);

            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        const blob = new Blob(byteArrays, { type: mimeType });
        const ext = CONFIG.allowedTypes[mimeType].ext;
        const file = new File([blob], `screenshot_${Date.now()}.${ext}`, { type: mimeType });

        // 上传文件
        uploadFile(editor, file, (success, data) => {
            if (success) {
                replaceImg(imgElement, data.url, data.url);
                // 更新编辑器内容
                editor.dispatch('change');

                editor.notificationManager.open({
                    text: '截图上传成功',
                    type: 'success',
                    timeout: 2000
                });
            } else {
                editor.notificationManager.open({
                    text: '截图上传失败: ' + data,
                    type: 'error',
                    timeout: 3000
                });
            }
        });
    }

    function isImageFile(file) {
        const fileInfo = CONFIG.allowedTypes[file.type];
        return fileInfo && fileInfo.type === 'image';
    }

    function isVideoFile(file) {
        const fileInfo = CONFIG.allowedTypes[file.type];
        return fileInfo && fileInfo.type === 'video';
    }

    // JavaScript上传函数修改
    async function uploadFile(editor, file, callback) {
        // 检查是否需要分片上传
        if (file.size > 10 * 1024 * 1024) { // 10MB以上使用分片上传
            await uploadLargeFile(editor, file, callback);
        } else {
            await uploadSmallFile(editor, file, callback);
        }
    }

    // 上传小文件（原方法）
    async function uploadSmallFile(editor, file, callback) {
        const uploadId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_id', uploadId);

        const notification = editor.notificationManager.open({
            text: `正在上传${isVideoFile(file) ? '视频' : (isImageFile(file) ? '图片' : '文件')}...`,
            type: 'info',
            timeout: false
        });

        const xhr = new XMLHttpRequest();

        xhr.timeout = 60 * 60 * 1000;
        xhr.ontimeout = function () {
            editor.notificationManager.close(notification);
            callback(false, new Error('上传超时'));
        };

        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                console.log('客户端进度:', percentComplete + '%');
            }
        });

        xhr.onload = function () {
            try {
                const response = JSON.parse(xhr.responseText);
                console.log('客户端上传完成:', response);
                editor.notificationManager.close(notification);

                if (response.success) {
                    callback(true, response.data);
                } else {
                    callback(false, response.error || '上传失败');
                }
            } catch (e) {
                editor.notificationManager.close(notification);
                callback(false, new Error('解析响应失败: ' + e.message));
            }
        };

        xhr.onerror = function (error) {
            editor.notificationManager.close(notification);
            callback(false, error);
        };

        xhr.open('POST', CONFIG.uploadUrl);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('X-Upload-ID', uploadId);
        xhr.send(formData);
    }

    // 上传大文件（分片上传）
    async function uploadLargeFile(editor, file, callback) {
        const chunkSize = 5 * 1024 * 1024; // 5MB per chunk
        const totalChunks = Math.ceil(file.size / chunkSize);
        const uploadId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2);

        const notification = editor.notificationManager.open({
            text: `正在分片上传${isVideoFile(file) ? '视频' : (isImageFile(file) ? '图片' : '文件')}... (0%)`,
            type: 'info',
            timeout: false
        });

        let uploadedChunks = 0;

        try {
            // 上传每个分片
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);

                const chunkFormData = new FormData();
                chunkFormData.append('chunk', chunk);
                chunkFormData.append('chunk_index', i);
                chunkFormData.append('total_chunks', totalChunks);
                chunkFormData.append('filename', file.name);
                chunkFormData.append('file_size', file.size);
                chunkFormData.append('upload_id', uploadId);
                chunkFormData.append('file_type', file.type);

                const chunkResponse = await uploadChunk(chunkFormData);

                if (!chunkResponse.success) {
                    throw new Error(chunkResponse.error || '分片上传失败');
                }

                uploadedChunks++;
                const progress = Math.round((uploadedChunks / totalChunks) * 100);
                notification.text(`正在分片上传${isImageFile(file) ? '图片' : '文件'}... (${progress}%)`);
            }

            // 合并分片
            const mergeResponse = await mergeChunks(uploadId, file.name);

            if (mergeResponse.success) {
                editor.notificationManager.close(notification);
                callback(true, mergeResponse.data);
            } else {
                throw new Error(mergeResponse.error || '合并分片失败');
            }
        } catch (error) {
            editor.notificationManager.close(notification);
            callback(false, error.message);
        }
    }

    // 上传单个分片
    function uploadChunk(chunkData) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.timeout = 60 * 60 * 1000;
            xhr.ontimeout = function () {
                resolve({ success: false, error: '分片上传超时' });
            };

            xhr.onload = function () {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (e) {
                    resolve({ success: false, error: '解析分片响应失败' });
                }
            };

            xhr.onerror = function () {
                resolve({ success: false, error: '分片上传网络错误' });
            };

            xhr.open('POST', CONFIG.uploadUrl + '?action=upload_chunk');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.send(chunkData);
        });
    }

    // 合并分片
    function mergeChunks(uploadId, filename) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('upload_id', uploadId);
            formData.append('filename', filename);

            const xhr = new XMLHttpRequest();

            xhr.timeout = 60 * 60 * 1000;
            xhr.ontimeout = function () {
                resolve({ success: false, error: '合并分片超时' });
            };

            xhr.onload = function () {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (e) {
                    resolve({ success: false, error: '解析合并响应失败' });
                }
            };

            xhr.onerror = function () {
                resolve({ success: false, error: '合并分片网络错误' });
            };

            xhr.open('POST', CONFIG.uploadUrl + '?action=merge_chunks');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.send(formData);
        });
    }

    /**
         * 开始轮询上传进度
         */
    function startProgressPolling(uploadId) {
        let lastLoaded = 0;
        let lastTime = Date.now();

        const interval = setInterval(async () => {
            const uploadPromise = fetch(`${CONFIG.progressUrl}&upload_id=${uploadId}`);
            uploadPromise.then(response => response.json())
                .then(data => {
                    console.error('获取进度:', data);
                    if (result.success && result.data.progress) {
                        const progress = result.data.progress;

                        // 更新状态
                        const statusMap = {
                            'initializing': '准备中',
                            'uploading': '上传中',
                            'processing': '处理中',
                            'complete': '完成',
                            'failed': '失败'
                        };

                        console.log(`上传状态: ${statusMap[progress.status]}`);
                        // 计算上传速度
                        const currentTime = Date.now();
                        const timeDiff = (currentTime - lastTime) / 1000; // 秒
                        const loadedDiff = progress.uploaded - lastLoaded;
                        const speed = timeDiff > 0 ? loadedDiff / timeDiff : 0;


                        console.log(`上传速度: ${progress.uploaded_formatted} / ${progress.filesize_formatted}
                        ${progress.percentage.toFixed(1)}% 
                        ${progress.percentage}%
                        ${speed > 0 ? `<span class="speed-info">${formatFileSize(speed)}/s</span>` : ''}`);

                        // 保存当前值用于计算速度
                        lastLoaded = progress.uploaded;
                        lastTime = currentTime;

                        // 如果上传完成，停止轮询
                        if (progress.status === 'complete' || progress.status === 'failed') {
                            clearInterval(interval);
                        }
                    }
                }).catch(error => {
                    console.error('获取进度失败:', error);
                    clearInterval(interval);
                });
        }, 500); // 每500毫秒查询一次进度

        return interval;
    }

    function formatFileSize(bytes) {
        if (bytes >= 1073741824) {
            return (bytes / 1073741824).toFixed(2) + ' GB';
        } else if (bytes >= 1048576) {
            return (bytes / 1048576).toFixed(2) + ' MB';
        } else if (bytes >= 1024) {
            return (bytes / 1024).toFixed(2) + ' KB';
        } else if (bytes > 1) {
            return bytes + ' bytes';
        } else if (bytes == 1) {
            return '1 byte';
        } else {
            return '0 bytes';
        }
    }
})();