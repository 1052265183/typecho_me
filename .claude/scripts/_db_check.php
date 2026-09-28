<?php
/**
 * 数据库连通自检（凭据现取现用，不落盘、不回显）。
 *
 * 为什么走 docker exec：本脚本在 WSL 内执行（Windows 侧没装 PHP），而 MySQL 跑在
 * WSL 的 Docker 网络里，容器名与映射端口在 WSL/Windows 两侧都无法直连（WSL 的
 * localhost 转发默认不通向 Windows）。只有进容器内用 127.0.0.1:3306 才稳定。
 * 容器是 mysql 镜像，不含 php，故用容器自带的 mysql 客户端而非 PDO。
 *
 * 凭据来源：解析项目根 config.inc.php 的 addServer 字面量（require 它拿不到数组，
 * 它返回 1，凭据是写死的字面量）。
 *
 * 用法：php .claude/scripts/_db_check.php
 * 依赖：WSL 发行版名可通过 TYPECHO_WSL_DISTRO 覆盖（默认 Android）
 */
$root = dirname(__DIR__, 2);
$raw = file_get_contents($root . '/config.inc.php');

$pick = function (string $key) use ($raw): string {
    return preg_match("/'" . preg_quote($key, '/') . "'\s*=>\s*'([^']*)'/", $raw, $m) ? $m[1] : '';
};

$dbName = $pick('database');
$user = $pick('user');
$password = $pick('password');
$charset = $pick('charset') ?: 'utf8mb4';

if ($dbName === '' || $user === '') {
    fwrite(STDERR, "未能从 config.inc.php 解析出 database/user\n");
    exit(1);
}

$container = getenv('TYPECHO_DB_CONTAINER') ?: 'mysql_test-mysql_test-1';

// 容器是 mysql 镜像，不含 php，故用容器自带的 mysql 客户端查版本
$cmd = sprintf(
    'docker exec -e MYSQL_PWD=%s %s mysql --default-character-set=utf8mb4 -u%s -h127.0.0.1 %s -N -e %s',
    escapeshellarg($password),
    escapeshellarg($container),
    escapeshellarg($user),
    escapeshellarg($dbName),
    escapeshellarg('SELECT VERSION();')
);

$descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
$process = proc_open(['bash', '-lc', $cmd], $descriptors, $pipes);

if (!is_resource($process)) {
    fwrite(STDERR, "无法启动 docker 进程\n");
    exit(1);
}

$out = trim(stream_get_contents($pipes[1]));
$err = trim(stream_get_contents($pipes[2]));
fclose($pipes[1]);
fclose($pipes[2]);
$code = proc_close($process);

if ($code !== 0) {
    // 只回显报错内容，不回显任何凭据
    fwrite(STDERR, '数据库连通失败：' . ($err !== '' ? $err : '退出码 ' . $code) . PHP_EOL);
    exit(1);
}

echo $out, PHP_EOL;
