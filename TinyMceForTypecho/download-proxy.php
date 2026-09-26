<?php
// download-proxy.php
header('Content-Type: application/json');
// error_reporting(E_ALL);//开启日志
error_reporting(0);//关闭日志
ini_set('display_errors', 0);
ini_set('log_errors', value: 0);//value：1开启日志

define('__TYPECHO_ROOT_DIR__', dirname(dirname(dirname(__DIR__))));
// ini_set('error_log', __DIR__ . '/logs/proxy_error.log');

// 记录请求开始
error_log("=== 代理请求开始 ===");
error_log("请求时间: " . date('Y-m-d H:i:s'));
error_log("请求IP: " . $_SERVER['REMOTE_ADDR']);

if (!isset($_POST['url'])) {
    $error = '缺少URL参数';
    error_log("错误: " . $error);
    echo json_encode([
        'success' => false,
        'error' => $error,
        'debug' => ['request' => $_POST]
    ]);
    exit;
}

$imageUrl = $_POST['url'];
error_log("请求URL: " . $imageUrl);

// 验证URL
if (!filter_var($imageUrl, FILTER_VALIDATE_URL)) {
    $error = '无效的URL: ' . $imageUrl;
    error_log($error);
    echo json_encode([
        'success' => false,
        'error' => $error,
        'debug' => ['image_url' => $imageUrl]
    ]);
    exit;
}

// 安全配置
$config = [
    'max_file_size' => 10 * 1024 * 1024, // 10MB限制
    'timeout' => 30,
    'blocked_extensions' => [
        'php',
        'php3',
        'php4',
        'php5',
        'php7',
        'phtml',
        'asp',
        'aspx',
        'jsp',
        'jar',
        'exe',
        'bat',
        'sh',
        'js',
        'html',
        'htm',
        'vbs'
    ]
];

// 方案1：尝试多种用户代理和请求头组合
$userAgents = [
    // Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Firefox
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',

    // Safari
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

$headersConfigs = [
    // 配置1：标准浏览器头
    [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding: gzip, deflate, br',
        'Connection: keep-alive',
        'Upgrade-Insecure-Requests: 1',
        'Sec-Fetch-Dest: image',
        'Sec-Fetch-Mode: no-cors',
        'Sec-Fetch-Site: cross-site',
    ],

    // 配置2：移动端头
    [
        'Accept: image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language: zh-CN,zh;q=0.9',
        'Accept-Encoding: gzip, deflate',
        'Connection: keep-alive',
        'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    ],

    // 配置3：简化头（有时反而有效）
    [
        'Accept: image/*',
        'Accept-Language: zh-CN,zh;q=0.9',
        'Connection: keep-alive',
    ],
];

// 尝试多种组合下载
$downloadSuccess = false;
$imageData = null;
$httpCode = 0;
$contentType = '';
$curlError = '';
$effectiveUrl = '';

error_log("开始尝试下载图片，使用多种请求头组合...");

foreach ($headersConfigs as $configIndex => $headers) {
    error_log("尝试配置 {$configIndex}:");

    $ch = curl_init();

    // 设置CURL选项
    curl_setopt($ch, CURLOPT_URL, $imageUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_MAXFILESIZE, $config['max_file_size']);
    curl_setopt($ch, CURLOPT_ENCODING, ''); // 自动解压

    // 随机选择用户代理
    $randomUserAgent = $userAgents[array_rand($userAgents)];
    curl_setopt($ch, CURLOPT_USERAGENT, $randomUserAgent);

    // 设置请求头
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    // 设置referer（非常重要）
    $referer = getRefererForUrl($imageUrl);
    if ($referer) {
        curl_setopt($ch, CURLOPT_REFERER, $referer);
        error_log("使用Referer: $referer");
    }

    // 设置cookie（如果需要）
    $cookie = getCookieForDomain(parse_url($imageUrl, PHP_URL_HOST));
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIE, $cookie);
    }

    // 执行请求
    $currentData = curl_exec($ch);
    $currentHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $currentContentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $currentCurlError = curl_error($ch);
    $currentEffectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);

    curl_close($ch);

    error_log("配置 {$configIndex} 结果: HTTP {$currentHttpCode}, 大小: " . strlen($currentData));

    if ($currentHttpCode === 200 && $currentData && strlen($currentData) > 100) {
        $downloadSuccess = true;
        $imageData = $currentData;
        $httpCode = $currentHttpCode;
        $contentType = $currentContentType;
        $curlError = $currentCurlError;
        $effectiveUrl = $currentEffectiveUrl;
        error_log("✅ 配置 {$configIndex} 下载成功!");
        break;
    }
}

if (!$downloadSuccess) {
    error_log("所有配置都失败，尝试备用方案...");

    // 备用方案：使用file_get_contents和stream_context
    $contextOptions = [
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept: image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language: zh-CN,zh;q=0.9',
                'Referer: https://blog.csdn.net/',
                'Connection: close',
            ]),
            'timeout' => 15,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ];

    $context = stream_context_create($contextOptions);
    $imageData = @file_get_contents($imageUrl, false, $context);

    if ($imageData && strlen($imageData) > 100) {
        $downloadSuccess = true;
        $httpCode = 200;
        error_log("✅ 备用方案下载成功!");
    }
}

if (!$downloadSuccess) {
    $error = "下载失败，HTTP代码：{$httpCode}，所有方法都尝试失败";
    error_log($error);
    echo json_encode([
        'success' => false,
        'error' => $error,
        'debug' => [
            'original_url' => $imageUrl,
            'last_http_code' => $httpCode,
            'curl_error' => $curlError
        ]
    ]);
    exit;
}

$downloadSize = strlen($imageData);
error_log("✅ 最终下载成功!");
error_log("最终URL: $effectiveUrl");
error_log("Content-Type: $contentType");
error_log("下载大小: " . $downloadSize . " 字节");

// 检查文件大小
if ($downloadSize > $config['max_file_size']) {
    $error = "文件太大，限制为 " . ($config['max_file_size'] / 1024 / 1024) . "MB";
    error_log($error);
    echo json_encode([
        'success' => false,
        'error' => $error,
        'debug' => [
            'file_size' => $downloadSize,
            'max_allowed' => $config['max_file_size']
        ]
    ]);
    exit;
}

error_log("文件下载成功，开始处理...");

// 获取文件扩展名
$extension = getFileExtension($contentType, $effectiveUrl);
error_log("检测到的扩展名: $extension");

// 检查是否在封禁扩展名列表中
if (in_array(strtolower($extension), $config['blocked_extensions'])) {
    $error = "不允许的文件类型: .$extension";
    error_log($error);
    echo json_encode([
        'success' => false,
        'error' => $error,
        'debug' => ['extension' => $extension]
    ]);
    exit;
}

// 生成安全的文件名
$filename = generateSafeFilename($effectiveUrl, $extension);
error_log("生成文件名: $filename");

// 创建按日期组织的目录
$datePath = date('Y/m/d');
$filePath = $datePath . '/' . $filename;
$relativePath = '../../uploads/' . $filePath;
$uploadPath = $relativePath;

// 创建目录
$uploadDir = dirname($relativePath);
if (!file_exists($uploadDir)) {
    error_log("创建目录: " . $uploadDir);
    if (!mkdir($uploadDir, 0755, true)) {
        $mkdirError = error_get_last();
        error_log("创建目录失败: " . $mkdirError['message']);
        echo json_encode([
            'success' => false,
            'error' => '创建目录失败: ' . $mkdirError['message'],
            'debug' => ['upload_dir' => $uploadDir]
        ]);
        exit;
    }
}

// 检查目录权限
if (!is_writable($uploadDir)) {
    error_log("目录不可写，尝试修改权限...");
    if (!chmod($uploadDir, 0755)) {
        $chmodError = error_get_last();
        error_log("权限修改失败: " . $chmodError['message']);

        $error = "上传目录不可写且无法修改权限: $uploadDir";
        error_log($error);
        echo json_encode([
            'success' => false,
            'error' => $error,
            'debug' => [
                'upload_dir' => $uploadDir,
                'permissions' => substr(sprintf('%o', fileperms($uploadDir)), -4),
                'chmod_error' => $chmodError
            ]
        ]);
        exit;
    }
    error_log("权限修改成功");
}

error_log("目录检查通过，开始保存文件...");
error_log("完整文件路径: $uploadPath");

// 检查磁盘空间
$freeSpace = disk_free_space($uploadDir);
error_log("磁盘可用空间: " . round($freeSpace / 1024 / 1024, 2) . " MB");

if ($freeSpace < $downloadSize * 2) {
    $error = "磁盘空间不足";
    error_log($error);
    echo json_encode([
        'success' => false,
        'error' => $error,
        'debug' => [
            'free_space' => round($freeSpace / 1024 / 1024, 2) . 'MB',
            'required_space' => round($downloadSize / 1024 / 1024, 2) . 'MB'
        ]
    ]);
    exit;
}

// 保存文件
$saveResult = file_put_contents($uploadPath, $imageData);
error_log("文件保存结果: " . ($saveResult ? "成功，写入 {$saveResult} 字节" : "失败"));

if ($saveResult === false) {
    $lastError = error_get_last();
    $errorMsg = $lastError['message'] ?? '未知错误';

    error_log("保存文件失败: $errorMsg");
    error_log("错误详情: " . print_r($lastError, true));

    echo json_encode([
        'success' => false,
        'error' => "保存文件失败: $errorMsg",
        'debug' => [
            'upload_path' => $uploadPath,
            'file_exists' => file_exists($uploadPath),
            'last_error' => $lastError,
            'disk_space_mb' => round($freeSpace / 1024 / 1024, 2)
        ]
    ]);
    exit;
}

// 设置文件权限
chmod($uploadPath, 0644);
$filePerms = substr(sprintf('%o', fileperms($uploadPath)), -4);
error_log("文件权限已设置为: $filePerms");

// 构建返回的URL
$relativeUrl = "/usr/uploads/" . $filePath;

error_log("相对URL: $relativeUrl");
error_log("文件大小: " . filesize($uploadPath) . " 字节");
error_log("=== 代理请求结束 ===");

echo json_encode([
    'success' => true,
    'url' => $relativeUrl,
    'filename' => $filename,
    'debug' => [
        'original_url' => $imageUrl,
        'effective_url' => $effectiveUrl,
        'upload_path' => $uploadPath,
        'file_size' => $saveResult,
        'file_permissions' => $filePerms,
        'directory' => $uploadDir,
        'http_code' => $httpCode,
        'content_type' => $contentType,
        'download_size' => $downloadSize
    ]
]);

/**
 * 获取适当的referer
 */
function getRefererForUrl($url)
{
    $host = parse_url($url, PHP_URL_HOST);

    $refererMap = [
        'i-blog.csdnimg.cn' => 'https://blog.csdn.net/',
        'img-blog.csdnimg.cn' => 'https://blog.csdn.net/',
        'csdnimg.cn' => 'https://blog.csdn.net/',
        'wx1.sinaimg.cn' => 'https://weibo.com/',
        'wx2.sinaimg.cn' => 'https://weibo.com/',
        'wx3.sinaimg.cn' => 'https://weibo.com/',
        'wx4.sinaimg.cn' => 'https://weibo.com/',
        'picx.zhimg.com' => 'https://www.zhihu.com/',
        'pica.zhimg.com' => 'https://www.zhihu.com/',
        'pic1.zhimg.com' => 'https://www.zhihu.com/',
        'pic2.zhimg.com' => 'https://www.zhihu.com/',
        'pic3.zhimg.com' => 'https://www.zhihu.com/',
    ];

    if (isset($refererMap[$host])) {
        return $refererMap[$host];
    }

    // 默认使用来源网站的首页
    return 'https://' . $host . '/';
}

/**
 * 获取cookie（如果需要）
 */
function getCookieForDomain($domain)
{
    $cookies = [
        'csdnimg.cn' => '', // 可以添加需要的cookie
        'zhimg.com' => '',
        'sinaimg.cn' => '',
    ];

    return $cookies[$domain] ?? '';
}

/**
 * 获取文件扩展名
 */
function getFileExtension($contentType, $url)
{
    // 从Content-Type获取
    if ($contentType) {
        $contentType = strtolower($contentType);
        $mimeToExt = [
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'image/bmp' => 'bmp',
            'image/svg+xml' => 'svg',
            'image/tiff' => 'tiff',
            'image/x-icon' => 'ico',
        ];

        if (isset($mimeToExt[$contentType])) {
            return $mimeToExt[$contentType];
        }

        if (preg_match('/image\/(\w+)/', $contentType, $matches)) {
            $ext = $matches[1];
            return $ext === 'jpeg' ? 'jpg' : $ext;
        }
    }

    // 从URL路径获取
    $path = parse_url($url, PHP_URL_PATH);
    if ($path) {
        $pathInfo = pathinfo($path);
        if (isset($pathInfo['extension'])) {
            $ext = strtolower($pathInfo['extension']);
            $ext = preg_replace('/[^a-z0-9]/', '', $ext);
            if (strlen($ext) <= 6 && strlen($ext) >= 1) {
                return $ext;
            }
        }
    }

    return 'jpg';
}

/**
 * 生成安全的文件名
 */
function generateSafeFilename($url, $extension)
{
    $path = parse_url($url, PHP_URL_PATH);
    $baseName = '';

    if ($path) {
        $pathInfo = pathinfo($path);
        if (isset($pathInfo['filename'])) {
            $baseName = $pathInfo['filename'];
            $baseName = preg_replace('/[^\w\-]/', '_', $baseName);
            $baseName = substr($baseName, 0, 50);
        }
    }

    if (empty($baseName) || strlen($baseName) < 3) {
        $baseName = substr(md5($url . time()), 0, 12);
    }

    $timestamp = time();
    $random = substr(md5(mt_rand()), 0, 6);

    return "{$baseName}_{$timestamp}_{$random}.{$extension}";
}

?>