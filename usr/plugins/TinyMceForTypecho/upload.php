<?php
/**
 * TinyMCE 文件上传接口 for Typecho
 * 增强版 - 支持大文件分片上传
 * @version 3.0
 */

// ============================================
// 配置部分
// ============================================
class UploadConfig
{
    // 文件大小限制（字节）
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

    // 分片大小（字节）
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

    // 临时分片存储目录
    const CHUNK_DIR = '/tmp/chunks/';
    
    // 允许的文件扩展名
    // 允许的文件扩展名
    const ALLOWED_EXTENSIONS = [
        // 图片类型
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'heic', 'heif', 'raw', 'psd', 'ai',
        // 视频类型
        'mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v', '3gp', 'mpeg', 'mpg', 'rm', 'rmvb', 'asf', 'f4v',
        // 音频类型
        'mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'ape', 'aiff', 'mid', 'midi', 'amr', 'opus', 'ac3',
        // 文档类型
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'csv', 'tsv',
        'html', 'htm', 'css', 'js', 'json', 'xml', 'yaml', 'yml', 'md', 'markdown', 'tex',
        // 归档文件类型
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'tgz', 'tar.gz', 'tar.bz2', 'tar.xz',
        // 应用程序类型
        'apk', 'app', 'exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'iso', 'img', 'bin', 'jar', 'war', 'ear',
        'swf', 'crx', 'xpi', 'ipa', 'aab',
        // 字体文件
        'ttf', 'otf', 'woff', 'woff2', 'eot',
        // 电子书
        'epub', 'mobi', 'azw', 'azw3', 'fb2',
        // 数据库文件
        'sql', 'db', 'sqlite', 'sqlite3',
        // 其他常见类型
        'log', 'cfg', 'conf', 'ini', 'env', 'sh', 'bat', 'cmd', 'ps1'
    ];

    // 上传目录（相对Typecho根目录）
    const UPLOAD_DIR = '/usr/uploads/';

    // 进度信息存储方式: 'session' 或 'file'
    const PROGRESS_STORAGE = 'session';

    // 如果使用文件存储，设置进度文件目录
    const PROGRESS_DIR = '/tmp/upload_progress/';

    // 进度信息过期时间（秒）
    const PROGRESS_EXPIRE = 3600; // 1小时

    // 是否启用图片压缩
    const COMPRESS_IMAGES = true;

    // 图片最大宽度（超出则压缩）
    const MAX_IMAGE_WIDTH = 1920;

    // 图片质量（0-100）
    const IMAGE_QUALITY = 85;

    // 启用上传进度功能
    const ENABLE_PROGRESS = false;

    // 调试模式
    const DEBUG_MODE = true;
}

// ============================================
// 初始化
// ============================================
// 完全禁用错误显示
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(0);

// 禁用session自动启动
ini_set('session.auto_start', 0);

// 开启输出缓冲
ob_start();
// 错误报告
if (UploadConfig::DEBUG_MODE) {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
    ini_set('log_errors', value: 1);
    ini_set('error_log', __DIR__ . '/logs/upload.log');
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
    ini_set('log_errors', value: 0);
    ini_set('error_log', __DIR__ . '/logs/upload.log');
}

// 设置时区
date_default_timezone_set('Asia/Shanghai');

// 记录开始时间
$startTime = microtime(true);

// 初始化进度存储
if (UploadConfig::ENABLE_PROGRESS && UploadConfig::PROGRESS_STORAGE === 'file') {
    if (!file_exists(UploadConfig::PROGRESS_DIR)) {
        mkdir(UploadConfig::PROGRESS_DIR, 0755, true);
    }
}

// ============================================
// 进度管理类
// ============================================

class UploadProgress
{
    private $uploadId;

    public function __construct($uploadId = null)
    {
        if ($uploadId) {
            $this->uploadId = $uploadId;
        } else {
            // 生成唯一上传ID
            $this->uploadId = 'upload_' . uniqid() . '_' . time();
        }
    }

    /**
     * 获取上传ID
     */
    public function getUploadId()
    {
        return $this->uploadId;
    }

    /**
     * 初始化进度信息
     */
    public function initialize($filename, $filesize, $extra = [])
    {
        $progress = [
            'upload_id' => $this->uploadId,
            'filename' => $filename,
            'filesize' => $filesize,
            'filesize_formatted' => $this->formatFileSize($filesize),
            'uploaded' => 0,
            'percentage' => 0,
            'start_time' => time(),
            'last_update' => time(),
            'status' => 'initializing',
            'speed' => 0,
            'remaining_time' => 0,
            'extra' => $extra
        ];

        $this->saveProgress($progress);
        return $progress;
    }

    /**
     * 更新进度
     */
    public function update($uploadedBytes)
    {
        $progress = $this->getProgress();

        if (!$progress) {
            return null;
        }

        $currentTime = time();
        $elapsedTime = $currentTime - $progress['start_time'];

        // 计算上传速度（字节/秒）
        if ($elapsedTime > 0) {
            $progress['speed'] = $uploadedBytes / $elapsedTime;
        }

        // 计算剩余时间
        if ($progress['speed'] > 0) {
            $remainingBytes = $progress['filesize'] - $uploadedBytes;
            $progress['remaining_time'] = ceil($remainingBytes / $progress['speed']);
        }

        // 计算百分比
        if ($progress['filesize'] > 0) {
            $progress['percentage'] = round(($uploadedBytes / $progress['filesize']) * 100, 2);
        }

        $progress['uploaded'] = $uploadedBytes;
        $progress['uploaded_formatted'] = $this->formatFileSize($uploadedBytes);
        $progress['last_update'] = $currentTime;
        $progress['status'] = $uploadedBytes >= $progress['filesize'] ? 'completed' : 'uploading';

        $this->saveProgress($progress);
        return $progress;
    }

    /**
     * 标记为处理中
     */
    public function setProcessing()
    {
        $progress = $this->getProgress();
        if ($progress) {
            $progress['status'] = 'processing';
            $progress['last_update'] = time();
            $this->saveProgress($progress);
        }
    }

    /**
     * 标记为完成
     */
    public function setComplete($result)
    {
        $progress = $this->getProgress();
        if ($progress) {
            $progress['status'] = 'complete';
            $progress['percentage'] = 100;
            $progress['result'] = $result;
            $progress['end_time'] = time();
            $progress['total_time'] = $progress['end_time'] - $progress['start_time'];
            $this->saveProgress($progress, 300); // 完成后保留5分钟
        }
    }

    /**
     * 标记为失败
     */
    public function setFailed($error)
    {
        $progress = $this->getProgress();
        if ($progress) {
            $progress['status'] = 'failed';
            $progress['error'] = $error;
            $progress['end_time'] = time();
            $progress['total_time'] = $progress['end_time'] - $progress['start_time'];
            $this->saveProgress($progress, 600); // 失败后保留10分钟
        }
    }

    /**
     * 获取当前进度
     */
    public function getProgress()
    {
        if (UploadConfig::PROGRESS_STORAGE === 'session') {
            session_start();
            $key = 'upload_progress_' . $this->uploadId;
            return $_SESSION[$key] ?? null;
        } else {
            $progressFile = UploadConfig::PROGRESS_DIR . $this->uploadId . '.json';
            if (file_exists($progressFile)) {
                $data = file_get_contents($progressFile);
                return json_decode($data, true);
            }
            return null;
        }
    }

    /**
     * 清理过期进度
     */
    public static function cleanup()
    {
        if (UploadConfig::PROGRESS_STORAGE === 'session') {
            session_start();
            $expireTime = time() - UploadConfig::PROGRESS_EXPIRE;
            foreach ($_SESSION as $key => $value) {
                if (strpos($key, 'upload_progress_') === 0) {
                    if (isset($value['last_update']) && $value['last_update'] < $expireTime) {
                        unset($_SESSION[$key]);
                    }
                }
            }
        } else {
            $progressDir = UploadConfig::PROGRESS_DIR;
            if (is_dir($progressDir)) {
                $files = glob($progressDir . '*.json');
                $expireTime = time() - UploadConfig::PROGRESS_EXPIRE;

                foreach ($files as $file) {
                    $data = file_get_contents($file);
                    $progress = json_decode($data, true);

                    if (isset($progress['last_update']) && $progress['last_update'] < $expireTime) {
                        unlink($file);
                    }
                }
            }
        }
    }

    /**
     * 保存进度信息
     */
    private function saveProgress($progress, $expireOffset = null)
    {
        $progress['last_update'] = time();

        if (UploadConfig::PROGRESS_STORAGE === 'session') {
            session_start();
            $key = 'upload_progress_' . $this->uploadId;
            $_SESSION[$key] = $progress;
        } else {
            $progressFile = UploadConfig::PROGRESS_DIR . $this->uploadId . '.json';
            file_put_contents($progressFile, json_encode($progress, JSON_PRETTY_PRINT));
        }
    }

    /**
     * 格式化文件大小
     */
    private function formatFileSize($bytes)
    {
        if ($bytes >= 1073741824) {
            return number_format($bytes / 1073741824, 2) . ' GB';
        } elseif ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 2) . ' MB';
        } elseif ($bytes >= 1024) {
            return number_format($bytes / 1024, 2) . ' KB';
        } elseif ($bytes > 1) {
            return $bytes . ' bytes';
        } elseif ($bytes == 1) {
            return '1 byte';
        } else {
            return '0 bytes';
        }
    }
}

// ============================================
// 分片上传管理类
// ============================================

class ChunkUploadManager
{
    private $uploadId;
    private $chunkDir;

    public function __construct($uploadId)
    {
        $this->uploadId = $uploadId;
        $this->chunkDir = UploadConfig::CHUNK_DIR;
        
        // 确保分片目录存在
        if (!file_exists($this->chunkDir)) {
            mkdir($this->chunkDir, 0755, true);
        }
    }

    /**
     * 保存分片
     */
    public function saveChunk($chunk, $chunkIndex)
    {
        $chunkPath = $this->getChunkPath($chunkIndex);
        return move_uploaded_file($chunk['tmp_name'], $chunkPath);
    }

    /**
     * 检查分片是否存在
     */
    public function chunkExists($chunkIndex)
    {
        return file_exists($this->getChunkPath($chunkIndex));
    }

    /**
     * 获取分片路径
     */
    private function getChunkPath($chunkIndex)
    {
        return $this->chunkDir . $this->uploadId . '_chunk_' . $chunkIndex;
    }

    /**
     * 获取已上传的分片数量
     */
    public function getUploadedChunksCount($totalChunks)
    {
        $count = 0;
        for ($i = 0; $i < $totalChunks; $i++) {
            if ($this->chunkExists($i)) {
                $count++;
            }
        }
        return $count;
    }

    /**
     * 合并所有分片
     */
    public function mergeChunks($totalChunks, $filename, $fileType)
    {
        // 计算文件哈希值（基于分片内容）
        $fileHash = $this->calculateFileHash($totalChunks);
        
        $outputPath = $this->generateFilePath($filename, $fileHash);
        $outputDir = dirname($outputPath);
        
        // 检查文件是否已存在
        if (file_exists($outputPath)) {
            // 文件已存在，清理分片并返回现有路径
            $this->cleanChunks($totalChunks);
            return $outputPath;
        }
        
        if (!file_exists($outputDir)) {
            mkdir($outputDir, 0755, true);
        }
        
        $outputHandle = fopen($outputPath, 'wb');
        if (!$outputHandle) {
            return false;
        }
        
        for ($i = 0; $i < $totalChunks; $i++) {
            $chunkPath = $this->getChunkPath($i);
            if (!file_exists($chunkPath)) {
                fclose($outputHandle);
                return false;
            }
            
            $chunkHandle = fopen($chunkPath, 'rb');
            if (!$chunkHandle) {
                fclose($outputHandle);
                return false;
            }
            
            while (!feof($chunkHandle)) {
                $buffer = fread($chunkHandle, 8192);
                fwrite($outputHandle, $buffer);
            }
            
            fclose($chunkHandle);
        }
        
        fclose($outputHandle);
        
        // 验证合并后的文件大小
        $expectedSize = 0;
        for ($i = 0; $i < $totalChunks; $i++) {
            $expectedSize += filesize($this->getChunkPath($i));
        }
        
        if (filesize($outputPath) !== $expectedSize) {
            unlink($outputPath);
            return false;
        }
        
        // 清理分片文件
        $this->cleanChunks($totalChunks);
        
        return $outputPath;
    }
    
    /**
     * 计算文件哈希值（基于所有分片内容）
     */
    private function calculateFileHash($totalChunks)
    {
        $hash = md5('');
        
        for ($i = 0; $i < $totalChunks; $i++) {
            $chunkPath = $this->getChunkPath($i);
            if (file_exists($chunkPath)) {
                $chunkHash = md5_file($chunkPath);
                $hash = md5($hash . $chunkHash);
            }
        }
        
        return substr($hash, 0, 12); // 使用前12位作为哈希值
    }

    /**
     * 生成最终文件路径
     */
    private function generateFilePath($originalName, $fileHash = null)
    {
        $datePath = date('Y/m/d');
        $pathInfo = pathinfo($originalName);
        $ext = strtolower($pathInfo['extension'] ?? '');
        
        // 验证文件扩展名
        if (!in_array($ext, UploadConfig::ALLOWED_EXTENSIONS)) {
            throw new Exception("不支持的文件扩展名: $ext");
        }
        
        // 保留原始文件名，移除可能的时间戳后缀
        $originalFilename = $pathInfo['filename'] ?? 'unknown';
        // 移除可能的时间戳后缀（如 _69b6939fa45c4_1773573023）
        $originalFilename = preg_replace('/_\w{13}_\d{10}$/', '', $originalFilename);
        
        // 使用文件哈希值或时间戳生成唯一文件名
        $uniquePart = $fileHash ? $fileHash : (uniqid() . '_' . time());
        $safeFilename = $originalFilename . '_' . $uniquePart . '.' . $ext;
        
        return __DIR__ . '/../../..' . UploadConfig::UPLOAD_DIR . $datePath . '/' . $safeFilename;
    }

    /**
     * 清理分片文件
     */
    public function cleanChunks($totalChunks)
    {
        for ($i = 0; $i < $totalChunks; $i++) {
            $chunkPath = $this->getChunkPath($i);
            if (file_exists($chunkPath)) {
                unlink($chunkPath);
            }
        }
    }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 记录日志
 */
function logMessage($message, $level = 'INFO')
{
    if (UploadConfig::DEBUG_MODE) {
        error_log($message);
    }
}

/**
 * 发送JSON响应
 */
/**
 * 发送JSON响应
 */
function sendJsonResponse($success, $data = [], $error = '', $progressId = null)
{
    // 如果已经发送过头部，添加一些检查
    if (headers_sent()) {
        error_log('警告：头部已发送，无法设置HTTP头部');
    } else {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, Authorization, X-Upload-ID');

        // 如果是错误响应，设置HTTP状态码
        if (!$success) {
            http_response_code(400);
        }
    }

    // 构建响应数组
    $response = [
        'success' => $success,
        'timestamp' => time(),
        'execution_time' => round((microtime(true) - $GLOBALS['startTime']) * 1000, 2) . 'ms'
    ];

    if ($progressId) {
        $response['upload_id'] = $progressId;
    }

    if ($success) {
        // 修正：确保返回的数据结构一致
        if (!empty($data['file'])) {
            $response['data'] = $data['file'];
        } else {
            $response['data'] = $data;
        }

        if (!empty($data['message'])) {
            $response['message'] = $data['message'];
        }
    } else {
        $response['error'] = $error ?: '未知错误';
        if (!headers_sent()) {
            http_response_code(400);
        }
    }

    // 清除之前的输出（如果有）
    if (ob_get_length() > 0) {
        ob_clean();
    }

    // 输出JSON
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

    logMessage("响应: " . json_encode($response, JSON_UNESCAPED_UNICODE));

    // 确保输出被发送
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }

    exit;
}

/**
 * 处理进度查询请求
 */
function handleProgressQuery()
{
    $uploadId = $_GET['upload_id'] ?? $_SERVER['HTTP_X_UPLOAD_ID'] ?? null;

    if (!$uploadId) {
        sendJsonResponse(false, [], '缺少上传ID');
    }

    $progressManager = new UploadProgress($uploadId);
    $progress = $progressManager->getProgress();

    if (!$progress) {
        sendJsonResponse(false, [], '上传进度不存在或已过期');
    }

    // 清理过期进度
    UploadProgress::cleanup();

    sendJsonResponse(true, [
        'progress' => $progress
    ]);
}


/**
 * 获取安全站点URL
 */
function getSiteUrl()
{
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        ($_SERVER['SERVER_PORT'] == 443) ? 'https://' : 'http://';

    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    
    // 保留端口号
    return $protocol . $host;
}

/**
 * 压缩图片
 */
function compressImage($filePath, $maxWidth = 1920, $quality = 85)
{
    if (!UploadConfig::COMPRESS_IMAGES) {
        return false;
    }

    $imageInfo = @getimagesize($filePath);
    if (!$imageInfo) {
        return false;
    }

    list($width, $height, $type) = $imageInfo;

    if ($width <= $maxWidth) {
        return true;
    }

    $newWidth = $maxWidth;
    $newHeight = intval($height * ($maxWidth / $width));

    switch ($type) {
        case IMAGETYPE_JPEG:
            $srcImage = imagecreatefromjpeg($filePath);
            break;
        case IMAGETYPE_PNG:
            $srcImage = imagecreatefrompng($filePath);
            break;
        case IMAGETYPE_GIF:
            $srcImage = imagecreatefromgif($filePath);
            break;
        case IMAGETYPE_WEBP:
            $srcImage = imagecreatefromwebp($filePath);
            break;
        default:
            return false;
    }

    if (!$srcImage) {
        return false;
    }

    $dstImage = imagecreatetruecolor($newWidth, $newHeight);

    if ($type == IMAGETYPE_PNG || $type == IMAGETYPE_WEBP) {
        imagealphablending($dstImage, false);
        imagesavealpha($dstImage, true);
        $transparent = imagecolorallocatealpha($dstImage, 255, 255, 255, 127);
        imagefilledrectangle($dstImage, 0, 0, $newWidth, $newHeight, $transparent);
    }

    imagecopyresampled($dstImage, $srcImage, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

    $result = false;
    switch ($type) {
        case IMAGETYPE_JPEG:
            $result = imagejpeg($dstImage, $filePath, $quality);
            break;
        case IMAGETYPE_PNG:
            $pngQuality = 9 - round($quality * 9 / 100);
            $result = imagepng($dstImage, $filePath, $pngQuality);
            break;
        case IMAGETYPE_GIF:
            $result = imagegif($dstImage, $filePath);
            break;
        case IMAGETYPE_WEBP:
            $result = imagewebp($dstImage, $filePath, $quality);
            break;
    }

    imagedestroy($srcImage);
    imagedestroy($dstImage);

    return $result;
}

/**
 * 清理文件名
 */
/**
 * 清理文件名 - 支持中文和国际化字符
 */
function sanitizeFilename($filename)
{
    $filename = basename($filename);
    logMessage("sanitizeFilename: $filename");

    // 保留字母、数字、中文、基本标点符号（不包括危险字符）
    // \p{L} = 所有语言的字母
    // \p{N} = 数字
    // \p{P} = 标点符号（但排除了危险符号）
    $filename = preg_replace('/[<>"\/\\|?*\x00-\x1f]/', '_', $filename);
    $filename = preg_replace('/[^\p{L}\p{N}\-\. _~()]/u', '_', $filename);

    logMessage("sanitizeFilename1: $filename");

    // 使用字节长度检查，因为某些文件系统按字节计算长度
    if (strlen($filename) > 255) {
        $ext = pathinfo($filename, PATHINFO_EXTENSION);
        // 为扩展名和点号预留空间
        $nameMaxLen = 255 - strlen($ext) - 1;
        if ($nameMaxLen > 0) {
            $name = mb_substr(pathinfo($filename, PATHINFO_FILENAME), 0, $nameMaxLen, 'UTF-8');
            $filename = $name . '.' . $ext;
        }
    }

    return $filename;
}

// ============================================
// 主程序开始
// ============================================

try {
    logMessage("===== 上传请求开始 =====");
    logMessage("请求方法: " . ($_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN'));
    logMessage("请求参数: " . print_r($_GET, true));

    // 清理过期进度
    UploadProgress::cleanup();

    // 处理进度查询请求
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'progress') {
        handleProgressQuery();
    }

    // 检查请求方法
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        logMessage("错误请求方法", 'ERROR');
        sendJsonResponse(false, [], '仅支持POST请求');
    }

    // 处理分片上传
    if (isset($_GET['action']) && $_GET['action'] === 'upload_chunk') {
        handleChunkUpload();
    }
    
    // 处理分片合并
    if (isset($_GET['action']) && $_GET['action'] === 'merge_chunks') {
        handleMergeChunks();
    }

    // CSRF验证
    if (!validateCsrfToken()) {
        logMessage("CSRF验证失败", 'ERROR');
        sendJsonResponse(false, [], '安全验证失败，请刷新页面重试');
    }

    // 检查文件上传
    if (!isset($_FILES['image']) && !isset($_FILES['file'])) {
        logMessage("没有上传文件字段", 'ERROR');
        sendJsonResponse(false, [], '没有上传文件');
    }

    // 获取文件字段名
    $fileField = isset($_FILES['image']) ? 'image' : 'file';
    $file = $_FILES[$fileField];

    logMessage("上传文件: " . print_r($file, true), 'DEBUG');

    // 检查上传错误
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => '文件大小超过服务器限制',
            UPLOAD_ERR_FORM_SIZE => '文件大小超过表单限制',
            UPLOAD_ERR_PARTIAL => '文件只有部分被上传',
            UPLOAD_ERR_NO_FILE => '没有文件被上传',
            UPLOAD_ERR_NO_TMP_DIR => '缺少临时文件夹',
            UPLOAD_ERR_CANT_WRITE => '写入文件失败',
            UPLOAD_ERR_EXTENSION => 'PHP扩展阻止了文件上传'
        ];

        $errorMsg = $errorMessages[$file['error']] ?? '上传出错，错误代码: ' . $file['error'];
        logMessage("上传错误: $errorMsg", 'ERROR');
        sendJsonResponse(false, [], $errorMsg);
    }

    // 检查文件大小
    if ($file['size'] === 0) {
        logMessage("文件大小为0", 'ERROR');
        sendJsonResponse(false, [], '上传文件为空');
    }

    if ($file['size'] > UploadConfig::MAX_FILE_SIZE) {
        $maxSizeMB = round(UploadConfig::MAX_FILE_SIZE / 1024 / 1024, 1);
        $fileSizeMB = round($file['size'] / 1024 / 1024, 1);
        logMessage("文件大小超限: {$fileSizeMB}MB > {$maxSizeMB}MB", 'ERROR');
        sendJsonResponse(false, [], "文件大小不能超过{$maxSizeMB}MB");
    }

    // 检查临时文件
    if (!file_exists($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        logMessage("临时文件不存在或非法访问", 'ERROR');
        sendJsonResponse(false, [], '文件上传失败');
    }

    // 验证文件类型 - 简化为只验证扩展名
    $originalName = sanitizeFilename($file['name']);
    $pathInfo = pathinfo($originalName);
    $ext = strtolower($pathInfo['extension'] ?? '');

    if (!in_array($ext, UploadConfig::ALLOWED_EXTENSIONS)) {
        logMessage("不支持的文件扩展名: $ext", 'ERROR');
        sendJsonResponse(false, [], "不支持的文件扩展名: $ext");
    }

    logMessage("验证通过的扩展名: $ext", 'DEBUG');

    // 初始化上传进度
    $uploadId = null;
    $progressManager = null;

    if (UploadConfig::ENABLE_PROGRESS) {
        // 从请求头获取或生成上传ID
        $uploadId = $_POST['upload_id'] ?? $_SERVER['HTTP_X_UPLOAD_ID'] ?? null;
        $progressManager = new UploadProgress($uploadId);
        $uploadId = $progressManager->getUploadId();

        // 初始化进度信息
        $extraInfo = [
            'original_name' => $originalName,
            'mime_type' => $file['type'],
            'client_ip' => $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'
        ];

        $progressManager->initialize($originalName, $file['size'], $extraInfo);

        // 立即返回上传ID，让客户端可以开始轮询进度
        if ($_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
            // 如果是AJAX请求，先返回上传ID
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'upload_id' => $uploadId,
                'message' => '开始上传',
                'filesize' => $file['size'],
                'filesize_formatted' => formatFileSize($file['size'])
            ]);
            flush(); // 立即输出
        }
    }

    // 生成安全的文件名 - 保留原始文件名，使用哈希值防止重复
    $datePath = date('Y/m/d');
    
    // 计算文件哈希值
    $fileHash = md5_file($file['tmp_name']);
    $fileHash = substr($fileHash, 0, 12); // 使用前12位作为哈希值
    
    $ext = strtolower($pathInfo['extension'] ?? '');
    
    // 保留原始文件名，移除可能的时间戳后缀
    $originalFilename = $pathInfo['filename'] ?? 'unknown';
    // 移除可能的时间戳后缀（如 _69b6939fa45c4_1773573023）
    $originalFilename = preg_replace('/_\w{13}_\d{10}$/', '', $originalFilename);
    
    // 生成安全的文件名
    $safeFilename = $originalFilename . '_' . $fileHash . '.' . $ext;
    
    $relativePath = UploadConfig::UPLOAD_DIR . $datePath . '/' . $safeFilename;
    $fullPath = __DIR__ . '/../../..' . $relativePath;
    
    // 检查文件是否已存在
    if (file_exists($fullPath)) {
        // 文件已存在，返回现有文件信息
        $fileSize = filesize($fullPath);
        $siteUrl = getSiteUrl();
        $fileUrl = $siteUrl . $relativePath;
        
        $fileInfo = [
            'url' => $relativePath,
            'full_url' => $fileUrl,
            'name' => $originalName,
            'size' => $fileSize,
            'size_formatted' => formatFileSize($fileSize),
            'type' => $file['type'],
            'extension' => $ext,
            'upload_time' => date('Y-m-d H:i:s')
        ];
        
        logMessage("文件已存在，返回现有文件: " . $originalName, 'INFO');
        sendJsonResponse(true, [
            'file' => $fileInfo,
            'message' => '文件已存在'
        ]);
    }

    logMessage("目标路径: $fullPath", 'DEBUG');

    // 创建目录
    $dir = dirname($fullPath);
    if (!file_exists($dir)) {
        logMessage("创建目录: $dir", 'DEBUG');
        if (!mkdir($dir, 0755, true)) {
            logMessage("创建目录失败: $dir", 'ERROR');
            if ($progressManager) {
                $progressManager->setFailed('创建目录失败，请检查权限');
            }
            sendJsonResponse(false, [], '创建目录失败，请检查权限');
        }

        // 创建索引文件防止目录列表
        $indexFile = $dir . '/index.html';
        if (!file_exists($indexFile)) {
            file_put_contents($indexFile, '<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body><h1>Directory access is forbidden</h1></body></html>');
        }
    }

    // 检查目录是否可写
    if (!is_writable($dir)) {
        logMessage("目录不可写: $dir", 'ERROR');
        if ($progressManager) {
            $progressManager->setFailed('上传目录不可写，请检查权限');
        }
        sendJsonResponse(false, [], '上传目录不可写，请检查权限');
    }

    // 标记为处理中
    if ($progressManager) {
        $progressManager->setProcessing();
    }

    // 移动文件
    logMessage("开始移动文件...", 'DEBUG');
    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        logMessage("移动文件失败", 'ERROR');
        if ($progressManager) {
            $progressManager->setFailed('文件保存失败，请检查目录权限');
        }
        sendJsonResponse(false, [], '文件保存失败，请检查目录权限');
    }

    // 验证文件已保存
    if (!file_exists($fullPath)) {
        logMessage("文件保存后不存在: $fullPath", 'ERROR');
        if ($progressManager) {
            $progressManager->setFailed('文件保存失败');
        }
        sendJsonResponse(false, [], '文件保存失败');
    }

    // 文件保存成功，设置权限
    chmod($fullPath, 0644);

    // 如果是图片，进行压缩处理
    $thumbnailUrl = '';
    if (strpos($file['type'], 'image/') === 0) {
        // 压缩图片
        if (compressImage($fullPath, UploadConfig::MAX_IMAGE_WIDTH, UploadConfig::IMAGE_QUALITY)) {
            logMessage("图片压缩成功", 'DEBUG');
        }

    }

    // 生成文件URL
    $siteUrl = getSiteUrl();
    $fileUrl = $siteUrl . $relativePath;

    // 获取文件信息
    $fileSize = filesize($fullPath);
    $fileInfo = [
        'url' => $relativePath,
        'full_url' => $fileUrl,
        'name' => $originalName,
        'size' => $fileSize,
        'size_formatted' => formatFileSize($fileSize),
        'type' => $file['type'],
        'extension' => $ext,
        'upload_time' => date('Y-m-d H:i:s')
    ];

    if ($thumbnailUrl) {
        $fileInfo['thumbnail_url'] = $thumbnailUrl;
    }

    logMessage("上传成功: " . $originalName, 'INFO');

    // 标记进度为完成
    if ($progressManager) {
        $progressManager->setComplete($fileInfo);
    }

    // 返回成功响应
    sendJsonResponse(true, [
        'file' => $fileInfo,
        'upload_id' => $uploadId,
        'progress' => $progressManager ? $progressManager->getProgress() : null,
        'message' => '上传成功'
    ]);

} catch (Exception $e) {
    logMessage("上传异常: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine(), 'ERROR');

    // 标记进度为失败
    if (isset($progressManager) && $progressManager) {
        $progressManager->setFailed($e->getMessage());
    }

    sendJsonResponse(false, [], '服务器内部错误: ' . (UploadConfig::DEBUG_MODE ? $e->getMessage() : '请联系管理员'));
}

/**
 * 处理分片上传
 */
function handleChunkUpload()
{
    try {
        if (!isset($_FILES['chunk']) || !isset($_POST['chunk_index']) || 
            !isset($_POST['total_chunks']) || !isset($_POST['upload_id'])) {
            sendJsonResponse(false, [], '缺少必要参数');
        }

        $chunk = $_FILES['chunk'];
        $chunkIndex = (int)$_POST['chunk_index'];
        $totalChunks = (int)$_POST['total_chunks'];
        $uploadId = $_POST['upload_id'];
        $filename = $_POST['filename'] ?? 'unknown';

        // 验证上传ID格式
        if (!preg_match('/^upload_[a-zA-Z0-9_]+$/', $uploadId)) {
            sendJsonResponse(false, [], '无效的上传ID');
        }

        // 创建分片上传管理器
        $chunkManager = new ChunkUploadManager($uploadId);

        // 保存分片
        if (!$chunkManager->saveChunk($chunk, $chunkIndex)) {
            sendJsonResponse(false, [], '保存分片失败');
        }

        // 计算进度
        $uploadedChunks = $chunkManager->getUploadedChunksCount($totalChunks);
        $progressPercentage = round(($uploadedChunks / $totalChunks) * 100, 2);

        sendJsonResponse(true, [
            'message' => "分片 $chunkIndex 上传成功",
            'chunks_uploaded' => $uploadedChunks,
            'total_chunks' => $totalChunks,
            'progress' => $progressPercentage,
            'filename' => $filename
        ]);
    } catch (Exception $e) {
        logMessage("分片上传异常: " . $e->getMessage(), 'ERROR');
        sendJsonResponse(false, [], '分片上传失败: ' . $e->getMessage());
    }
}

/**
 * 处理分片合并
 */
function handleMergeChunks()
{
    try {
        if (!isset($_POST['upload_id']) || !isset($_POST['filename'])) {
            sendJsonResponse(false, [], '缺少必要参数');
        }

        $uploadId = $_POST['upload_id'];
        $filename = $_POST['filename'];

        // 验证上传ID格式
        if (!preg_match('/^upload_[a-zA-Z0-9_]+$/', $uploadId)) {
            sendJsonResponse(false, [], '无效的上传ID');
        }

        // 获取第一个分片的MIME类型
        $firstChunkPath = UploadConfig::CHUNK_DIR . $uploadId . '_chunk_0';
        if (!file_exists($firstChunkPath)) {
            sendJsonResponse(false, [], '缺少初始分片');
        }

        // 检测文件类型
        $detectedMime = 'application/octet-stream';
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $detectedMime = finfo_file($finfo, $firstChunkPath);
                finfo_close($finfo);
            }
        } else {
            // 当fileinfo扩展不可用时，根据文件扩展名猜测MIME类型
            $pathInfo = pathinfo($filename);
            $ext = strtolower($pathInfo['extension'] ?? '');
            $mimeTypes = [
                'mp4' => 'video/mp4',
                'webm' => 'video/webm',
                'ogg' => 'video/ogg',
                'avi' => 'video/x-msvideo',
                'mov' => 'video/quicktime',
                'wmv' => 'video/x-ms-wmv',
                'flv' => 'video/x-flv',
                'mkv' => 'video/x-matroska',
                'jpg' => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'png' => 'image/png',
                'gif' => 'image/gif',
                'webp' => 'image/webp',
                'svg' => 'image/svg+xml',
                'bmp' => 'image/bmp'
            ];
            if (isset($mimeTypes[$ext])) {
                $detectedMime = $mimeTypes[$ext];
            }
        }

        // 验证文件类型 - 简化为只验证扩展名
        $pathInfo = pathinfo(sanitizeFilename($filename));
        $ext = strtolower($pathInfo['extension'] ?? '');

        if (!in_array($ext, UploadConfig::ALLOWED_EXTENSIONS)) {
            sendJsonResponse(false, [], "不支持的文件扩展名: $ext");
        }

        // 创建分片上传管理器
        $chunkManager = new ChunkUploadManager($uploadId);

        // 计算总分片数
        $totalChunks = (int)$_POST['total_chunks'] ?? 0;
        if ($totalChunks <= 0) {
            // 从文件系统中计算
            $totalChunks = 0;
            while (file_exists(UploadConfig::CHUNK_DIR . $uploadId . '_chunk_' . $totalChunks)) {
                $totalChunks++;
            }
        }

        // 检查所有分片是否都已上传
        for ($i = 0; $i < $totalChunks; $i++) {
            if (!$chunkManager->chunkExists($i)) {
                sendJsonResponse(false, [], "分片 $i 未上传完成");
            }
        }

        // 合并分片
        $mergedFilePath = $chunkManager->mergeChunks($totalChunks, $filename, $detectedMime);

        if (!$mergedFilePath) {
            sendJsonResponse(false, [], '合并分片失败');
        }

        // 验证合并后的文件
        if (!file_exists($mergedFilePath)) {
            sendJsonResponse(false, [], '合并后文件不存在');
        }

        // 如果是图片，进行压缩处理
        if (strpos($detectedMime, 'image/') === 0) {
            if (compressImage($mergedFilePath, UploadConfig::MAX_IMAGE_WIDTH, UploadConfig::IMAGE_QUALITY)) {
                logMessage("图片压缩成功", 'DEBUG');
            }
        }

        // 生成文件URL
        $relativePath = str_replace(__DIR__ . '/../../..', '', $mergedFilePath);
        $siteUrl = getSiteUrl();
        $fileUrl = $siteUrl . $relativePath;

        // 获取文件信息
        $fileSize = filesize($mergedFilePath);
        $fileInfo = [
            'url' => $relativePath,
            'full_url' => $fileUrl,
            'name' => sanitizeFilename($filename),
            'size' => $fileSize,
            'size_formatted' => formatFileSize($fileSize),
            'type' => $detectedMime,
            'extension' => $ext,  // 直接使用从文件名提取的扩展名
            'upload_time' => date('Y-m-d H:i:s')
        ];

        logMessage("大文件上传成功: " . $filename, 'INFO');

        sendJsonResponse(true, [
            'file' => $fileInfo,
            'upload_id' => $uploadId,
            'message' => '大文件上传成功'
        ]);
    } catch (Exception $e) {
        logMessage("合并分片异常: " . $e->getMessage(), 'ERROR');
        sendJsonResponse(false, [], '合并分片失败: ' . $e->getMessage());
    }
}

/**
 * 验证CSRF令牌
 */
function validateCsrfToken()
{
    // 实际应用中应该根据Typecho的CSRF机制进行验证
    // 此处简化处理
    return true;
}

/**
 * 格式化文件大小
 */
function formatFileSize($bytes)
{
    if ($bytes >= 1073741824) {
        return number_format($bytes / 1073741824, 2) . ' GB';
    } elseif ($bytes >= 1048576) {
        return number_format($bytes / 1048576, 2) . ' MB';
    } elseif ($bytes >= 1024) {
        return number_format($bytes / 1024, 2) . ' KB';
    } elseif ($bytes > 1) {
        return $bytes . ' bytes';
    } elseif ($bytes == 1) {
        return '1 byte';
    } else {
        return '0 bytes';
    }
}