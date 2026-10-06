# ADR-003: 本机 WSL 承载正式环境，替换宝塔 Docker 发布链路

**状态**：已采纳
**日期**：2026-10-06
**关联**：ADR-002（正式环境同步 WaterDrop 与复制按钮兜底修复，其 §0.6 发布链路被本决策取代）、CLAUDE.md §0.6

## 背景

诉求：正式环境的代码发布要靠「宝塔面板 Bash + base64 分块传输」，每次都要建快照、算哈希、三方比对，太慢太险；希望改成在 Windows 上另建目录、用 WSL 直接跑当正式环境。

动手前先做只读调查，结论推翻了初始判断的**两处**：

1. **正式环境本来就在这台机器上**。`curl http://localhost:22380/` 返回 HTTP 200，页面标题是「Thron的博客」，容器 `typecho_agbf-typecho_AGbF-1` 跑在本机 WSL 里，代码在 `/www/dk_project/dk_app/typecho/typecho_AGbF/data`（1.8G，其中 `usr/uploads` 1.6G / 832 个文件），`snapshots/20260928/` 与 CLAUDE.md §0.6.4 的记录逐一对得上。所谓"远程宝塔服务器"就是本机。
2. **发布笨重与 Docker 无关**，根因是服务器 SSH 未运行（root 配了「仅密钥登录」但无密钥），`scp`/`rsync` 不可用，只能退化成面板 Bash + base64。而按 ADR-002 背景 1 的记录，这套流程已经出过事故（base64 块边界把单词劈成两半）。

现场数据（决定方案可行性）：
- `rewrite=0` → 永久链接形如 `/index.php/archives/1/`，**不需要 URL 重写规则**
- `theme=WaterDrop`；`plugin:active` 选项不存在 → **未启用任何插件**
- 251 篇文章 + 1 页面 + 69 附件，1 用户，0 评论，库体积仅 11.55MB
- `.env` 里 DB 主机写的是 compose 服务名 `mysql_Ni7e`，本机实为 `mysql_wlzr-mysql_WLZr-1`

## 决策

1. **新环境根目录 `/root/www/typecho_prod`**，放 ext4 而非 `/mnt/e/`——跨 Windows 文件系统的小文件 IO（上传目录、静态资源）明显更慢，且 `php -S` 每请求都重读文件，跨盘更吃亏。
2. **Web 层用 `php -S` + 自写 `router.php`，不上 nginx/php-fpm**。`rewrite=0` 意味着 URL 带 `index.php`，但这仍依赖 PATH_INFO 路由，而 **`php -S` 不支持 PATH_INFO**——直接把 `/index.php/archives/1/` 当文件查找并 404。由 `router.php` 分流三类请求（真实文件交回内置服务器 / `.php` 与 `admin`、`install` 按自身路径执行 / 其余转交 `index.php` 并补 `PATH_INFO`）。自用并发个位数，不值得为此再装一套 nginx。
3. **`PHP_CLI_SERVER_WORKERS=4`**：内置服务器默认单线程，一个慢请求（如图片代理抓外链）会阻塞整个站点。PHP 7.4+ 支持多 worker，需 pcntl 扩展。
4. **数据库继续复用 `mysql_wlzr-mysql_WLZr-1` 容器**，不迁移。数据库不参与代码同步，复用它对"发布方便"这个核心诉求零贡献；而迁移要导出导入 11.55MB 数据并重配服务，纯风险。后续若要彻底去 Docker 再单独立项。
5. **两套环境各自独立的 `config.inc.php`**。新环境把 `host` 从 `mysql_Ni7e` 改为 `127.0.0.1`、`port` 从 3306 改为宿主映射端口 `13306`（compose 服务名在 WSL 宿主上不可解析），账号/库名沿用。同时把 `__TYPECHO_DEBUG__` 由 `true` 改为 `false`——原环境开着调试，错误详情会直接回显给访客。
6. **发布走 `_deploy_prod.sh`（rsync），默认 dry-run**。`usr/uploads/`、`config.inc.php` 永不参与同步（前者是用户数据，`--delete` 扫到即永久丢失；后者两套环境必须独立）。实跑必须显式加 `--apply`。发布后无需重启服务——`php -S` 每请求重解析文件。
7. **备份走 `_backup_prod.sh`**。数据库用 `mysqldump --single-transaction --no-tablespaces` 每日全量（1.6MB，保留 14 天）；`uploads` 用 `rsync --link-dest` 硬链接做每日增量快照、保留 7 天。理由：正式环境从"托管在服务器"变成"跑在个人电脑上"，这一层兜底不再有人替我们扛。
8. **服务用 `_prod_ctl.sh` 管理**（start/stop/restart/status/log），PID 文件停进程。不用 `pkill -f 'php -S 0.0.0.0:8001'`——那条命令会连执行它的 shell 一起杀掉，因为该 shell 的命令行里同样含这个字符串。
9. **旧宝塔环境暂不删除**。`/www/dk_project/dk_app/typecho/typecho_AGbF/` 原样保留作回滚点；穿透切到 8001 并稳定后再决定是否停容器。

## 备选

- **备选 A：数据库也搬到 WSL 原生安装的 MySQL/MariaDB** —— 否决（用户已确认）。数据库不参与代码同步，复用它对"发布方便"零贡献；迁移要导出导入、重配服务、开机自启，纯风险收益比为零。彻底去 Docker 可另立工单。
- **备选 B：nginx + php-fpm** —— 否决。`rewrite=0` 下无重写需求，自用并发个位数；多一套服务就多一套升级与故障面。代价是必须维护 `router.php` 来补 PATH_INFO（见决策 2）。
- **备选 C：不新建目录，直接在 `/www/dk_project/.../data` 上改代码** —— 否决。开发目录与正式目录物理分开，才能让 `_deploy_prod.sh` 用 `rsync` 单向覆盖而不担心误改生产；混在一处后每次编辑都要先想"改的是哪一份"。
- **备选 D：给远程服务器配 SSH 密钥，继续远程部署** —— 未采用（用户选择自用场景）。该方案同样能砍掉 base64 流程，但与"只自用/局域网/穿透"的定位不符，且放弃不了服务器成本换来的 7×24 与数据托管。

## 影响

- **文件范围**：新增 `.claude/scripts/` 下 6 个脚本（`router.php`、`_prod_ctl.sh`、`_deploy_prod.sh`、`_backup_prod.sh`、`_prod_probe.sh`、`_gen_prod_config.py`）；新增 `/root/www/typecho_prod`（WSL 内，不进 Git）；删除 `/root/www/typecho_prod/TinyMceForTypecho` 与 `usr/themes/` 下 4 个非 WaterDrop 主题（执行 `_deploy_prod.sh --apply` 时发生）。
- **URL 不变**：`siteUrl` 仍是 `http://xkj88.e3.luyouxia.net:29026`（存在数据库 options 表，不在配置文件里）。**穿透客户端需把映射从 22380 改到 8001**，该操作在内网穿透服务商侧，本决策无法代劳。
- **过渡期行为**：穿透仍指向旧 22380 时，用 `localhost:8001` 打开页面，HTML 里的静态资源地址仍按 `siteUrl` 指向穿透域名，会加载到旧环境的资源；HTML 结构本身可正常验证。
- **可用性变化**：博客不再 7×24——Windows 关机/休眠、WSL 被终止都会导致下线。自启配置见 DEVELOPER_RULES。
- **可回滚**：旧环境目录 `/www/dk_project/dk_app/typecho/typecho_AGbF/` 与容器 `typecho_agbf-typecho_AGbF-1` 未动，数据库未动，穿透配置改回 22380 即恢复。

## 修订

### 2026-10-06：发布方式由 rsync 同步改为 git pull（同日二次修订）

**修订前**：决策 6 规定发布走 `_deploy_prod.sh`（`rsync --delete` 从开发目录覆盖到正式环境），默认 dry-run。

**修订后**：改为 git 工作副本 + bare 仓库中转——

```
开发目录 (Windows) --commit/push--> E:\deepseek_work\typecho-bare.git --fetch/reset--> 正式环境 (WSL)
```

**变更理由**：

1. **版本可追溯**。rsync 只搬文件，正式环境处于哪个版本、哪次发布引入了故障都无法回答；git pull 让每次发布对应一个提交号，回滚即 `git reset --hard <上一提交>`。
2. **rsync 的 `--delete` 语义与 git 天然冲突**。正式环境独有但不该被删的内容（`config.inc.php`、`usr/uploads/`）必须靠 exclude 规则保护，多一条规则就多一分出错空间；git 用 `.gitignore` 从机制上排除，更稳。
3. **新增动作：发布前必须先 commit**。rsync 不关心工作区是否干净，git 强制"先提交才发布"，杜绝"改了没提交、发布的是旧代码"这类最常见的误发布。

**选 bare 仓库而非 GitHub 作为 remote**：WSL 的 SSH 密钥未在 GitHub 注册（实测 `Permission denied (publickey)`），而 bare 仓库位于 `E:\deepseek_work\typecho-bare.git`，Windows 与 WSL 都能直接访问，不需要公网、不需要密钥、不需要浏览器。代价是它只服务于本机，无法给第三台机器共用——若将来要恢复远程部署，需改为 GitHub remote。

**连带处理**：

- `router.php` 从 `.claude/scripts/` 复制到项目根并纳入版本控制——否则正式环境 `git pull` 拉不到它（`.claude/` 下的脚本不进库）。
- `.gitattributes` 补 `*.sh` / `*.py` / `*.md` 的 `eol=lf`。上游原本只声明了 PHP/JS/CSS，而 `.sh` 正是 WSL 要执行的文件，CRLF 入库会直接 `bad interpreter`。
- `.claude/backup/`（生产快照，678 文件含 55MB tar.gz）从版本控制移除并加入 `.gitignore`，磁盘文件保留。**注意：这些文件仍留在 git 历史里**，如需彻底清除要重写历史，本次不做。
- `usr/themes/*/.backup_*/` 加入 `.gitignore`——快照流程会在主题目录里产生备份目录。

**`_deploy_prod.sh` 不删除**：仍可用于一次性全量覆盖（会 `--delete` 掉正式环境的多余文件），日常发布一律走 git。

**新增坑**（已记入经验文档）：正式环境目录源自宝塔容器，`rsync` 保留了混合属主（`www-data`/`www`/`huxu`/`root`），以 root 跑 git 会触发 `dubious ownership` 拒绝一切命令。根治手段是 `chown -R root:root`，脚本内另加 `safe.directory` 豁免兜底。