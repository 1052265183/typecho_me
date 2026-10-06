<?php
/**
 * 为 Typecho 启用 TinyMCE 编辑器-非官方
 * 支持图片粘贴上传功能
 *
 * @package Define TinyMCE for Typecho
 * @author hello-code
 * @version 1.2
 * @link https://github.com/he110-c0de
 * Date: 2024-06-23
 */

namespace TypechoPlugin\TinyMceForTypecho;

use Typecho\Plugin\PluginInterface;
use Typecho\Widget\Helper\Form;
use Widget\Options;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class Plugin implements PluginInterface
{
	/**
	 * 插件激活
	 */
	public static function activate()
	{
		\Typecho\Plugin::factory('admin/write-post.php')->richEditor = array(__CLASS__, 'render');
		\Typecho\Plugin::factory('admin/write-page.php')->richEditor = array(__CLASS__, 'render');
		
		return '插件已激活，请确保/usr/uploads/目录有写入权限';
	}

	/**
	 * 插件停用
	 */
	public static function deactivate()
	{
	}

	public static function config(Form $form)
	{
	}

	public static function personalConfig(Form $form)
	{
	}

	/**
	 * 渲染编辑器
	 */
	public static function render($post)
	{
		$js = \Typecho\Common::url('TinyMceForTypecho/tinymce/tinymce.min.js', Options::alloc()->pluginUrl);
		$options = Options::alloc();
		
		// 构建上传URL
		$uploadUrl = $options->pluginUrl . '/TinyMceForTypecho/upload.php';
		
		echo '<script src="' . $js . '"></script>';
		echo '<script src="' . $options->pluginUrl . '/TinyMceForTypecho/custom.js"></script>';
		echo <<<EOF
<script>
// 全局变量，便于调试
window.TinyMCECustomConfig = {
	uploadUrl: '{$uploadUrl}',
	debug: true
};

</script>
EOF;
	}
}
?>