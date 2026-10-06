<?php
/**
 * php -S 内置服务器的路由脚本（router.php）
 *
 * 为什么需要它：Typecho 在 rewrite=0 时使用 `/index.php/archives/1/` 形式的永久链接，
 * 依赖服务器的 PATH_INFO 能力（Apache 的 AcceptPathInfo）。PHP 内置服务器没有这个
 * 能力，会把 /index.php/archives/1/ 当成一个不存在的文件而返回 404，
 * 所以必须由本脚本把「非真实文件」的请求转交给 index.php，并补上 SCRIPT_NAME /
 * SCRIPT_FILENAME / PATH_INFO，让 Typecho 的路由判定能正常工作。
 *
 * 三类请求分流：
 *   1. 真实文件（CSS / JS / 图片 / .php 实体）→ 交回内置服务器处理；
 *   2. .php 结尾或 admin/install 目录 → 按其自身路径执行；
 *   3. 其余全部 → 前台入口 index.php（Typecho 路由）。
 *
 * 用法：php -S 0.0.0.0:8001 -t . router.php
 */

$rootDir = __DIR__;
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// 1. 真实存在的文件交回内置服务器（静态资源与可直接执行的 PHP）
$target = $rootDir . urldecode($uri);
if (is_file($target)) {
    return false;
}

// 2. .php 文件，或 admin / install 下的请求，按自身路径执行
if (preg_match('#\.php$#', $uri)
    || preg_match('#^/(admin|install)(/|$)#', $uri)) {
    $script = $target;
    // 目录请求（/admin/）要落到它的 index.php，否则内置服务器只认实体文件
    if (is_dir($script)) {
        $script = rtrim($script, '/') . '/index.php';
    }
    if (!is_file($script)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not Found';
        return true;
    }
    $_SERVER['SCRIPT_NAME'] = $uri;
    $_SERVER['SCRIPT_FILENAME'] = $script;
    $_SERVER['PHP_SELF'] = $uri;
    require $script;
    return true;
}

// 3. 其余请求一律交给前台入口，并把 URL 里 index.php 之后的部分还原成 PATH_INFO
$pathInfo = '';
if (stripos($uri, '/index.php') === 0) {
    $pathInfo = substr($uri, strlen('/index.php'));
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $rootDir . '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';
$_SERVER['PATH_INFO'] = $pathInfo;

require $rootDir . '/index.php';
return true;