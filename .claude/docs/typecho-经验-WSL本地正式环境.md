# 经验：WSL 上承载 Typecho 正式环境

> 来源：2026-10-06 把正式环境从「宝塔 Docker + base64 分块传输」搬到本机 WSL 原生 `php -S` 的全过程。
> 决策与理由见 `02-技术设计/ADR-003-本机WSL承载正式环境替换宝塔Docker发布链路.md`；本文件只记踩坑。

## 一、先查再动手：两个预设都被推翻

动手前的只读调查推翻了两处判断，省掉了大量白工：

1. **"正式环境在远程服务器"——错，它就在本机**。`curl http://localhost:22380/` 返回 200，容器跑在本机 WSL，代码在 `/www/dk_project/dk_app/typecho/typecho_AGbF/data`。所谓"远程宝塔"就是这台机器。**发布笨重与 Docker 无关**，根因是 SSH 未运行、只能走面板 Bash + base64。
2. **`rewrite=0` 就不需要 Web 服务器改造——错**。`rewrite=0` 只是免了 URL 重写规则，永久链接仍是 `/index.php/archives/1/`，**依赖 PATH_INFO 路由**，而 `php -S` 不支持（见下）。

排查方法：`curl -s -o NUL -w "%{http_code}"` 探端口 + `docker ps -a` 看挂载，比读文档快且准。

## 二、`php -S` 不支持 PATH_INFO

**现象**：首页 200、RSS 200、静态资源 200，但文章页 `/index.php/archives/1/` 全部 404（返回的是 Typecho 自己的 404 页面）。

**原因**：`php -S` 收到 `/index.php/archives/1/` 时，会把它当成一个待返回的**文件路径**去找，找不到就 404。它没有 Apache 的 `AcceptPathInfo`。

**解法**：配 `router.php`（见 `.claude/scripts/router.php`），把非真实文件的请求转交 `index.php` 并补 `$_SERVER['PATH_INFO']`。三类请求分流：真实文件 → `return false` 交回内置服务器；`.php` 结尾或 `admin/`、`install/` → 按自身路径执行；其余 → 前台入口。

**附带坑**：router 里目录请求（`/admin/`）要落到它自己的 `index.php`，否则内置服务器只认实体文件，同样 404。

## 三、`php -S` 单线程会阻塞全站

内置服务器一次只处理一个请求。一个慢请求（如图片代理去抓外链）能把整站卡死。

**解法**：`PHP_CLI_SERVER_WORKERS=4 php -S ...`（PHP 7.4+，需 pcntl 扩展），实测会起 4 个 worker 进程。

## 四、`pkill -f` 会杀掉执行它的那个 shell

```bash
bash -c "pkill -f 'php -S 0.0.0.0:8001'; ...启动新服务..."
# 结果：服务被杀，新服务没起来，命令静默中断
```

**原因**：`pkill -f` 匹配完整命令行，而执行这条命令的 shell 自己的命令行里**也含** `php -S 0.0.0.0:8001` 这个字符串——它把自己也匹配上了。

**解法**：用 PID 文件停进程（`.claude/scripts/_prod_ctl.sh`）。若必须用 pkill，模式要锚定到进程开头：`pkill -f '^php -S'`。

## 五、docker `--filter name=` 区分大小写

容器名实为 `mysql_wlzr-mysql_WLZr-1`（**项目段小写 `wlzr`、服务段大写 `WLZr`**）。按大写写 `--filter name=mysql_WLZr` 匹配不到，返回空。

叠加第二个坑：用 `| head -1` 提前关闭管道 → docker 收到 SIGPIPE → 在 `set -o pipefail` 下整条命令失败、输出为空 → 表现为"容器明明在跑却找不到"。

**解法**：不依赖 docker 的 filter，直接对 Names 列匹配：

```bash
db_id="$(docker ps -a --format '{{.ID}} {{.Names}}' | awk '/mysql_wlzr/ {print $1; exit}')"
```

**另一个坑**：`docker exec <完整容器名>` 也报 `No such container`，但 `docker exec <容器ID>` 正常。**一律用 ID。**

## 六、`rsync -a` 保留 mtime，导致备份脚本删掉刚建的快照

**现象**：备份脚本输出"uploads 快照已创建，实际占用 1.6G"，下一秒目录就不见了。

**原因**：`rsync -a` 含 `-t`，会连**目录**的 mtime 一起保留。源 `usr/uploads/` 的 mtime 是"最后一次上传"的时间（可能几十天前），于是新建的快照目录 mtime 也是那个旧时间；脚本末尾的 `find -mtime +7` 清理判定把它当成陈旧项，当场 `rm -rf`。

**解法**：`rsync` 之后 `touch "$dest"` 重置目录 mtime。清理策略若按时间，**必须以自己写入的时间戳为准，不能依赖被保留的 mtime**。

## 七、脱敏正则漏掉了实际写法

打印配置文件前用 `sed` 打码密码，正则写成 `password['"]?\s*[:=]\s*['"][^'"]*`——结果 Typecho 的实际写法是 `'password' => '...'`（带空格和 `=>`），**没匹配上，数据库明文口令被打印了出来**。

**解法**：正则按实际格式写，并在打印前统一过一遍打码函数；同时对 `user` 也打码（它是账号名，同样敏感）。参考 `.claude/scripts/_gen_prod_config.py` 的 `mask()`。

## 八、PowerShell 传参会吃掉引号

从 Windows 侧 `wsl -d Android -- bash -c "... grep -E 'a|b' ..."` 时，PowerShell 会先处理引号，导致 `|` 被 bash 当管道、`{{.Names}}` 变成 `command not found`。

**解法**：凡是复杂命令（引号嵌套、正则、`--format` 模板）一律写进脚本文件再 `wsl -- bash /mnt/e/.../script.sh`，不要拼命令行。这条对 `.sh` 与 `.py` 都适用。

另外 `>/tmp/xxx` 会被 PowerShell 解释成 `E:\tmp\xxx`，重定向也要放进 WSL 内部。

## 九、`mysqldump` 缺 PROCESS 权限

用应用用户 dump 报 `Access denied; you need (at least one of) the PROCESS privilege(s) when trying to dump tablespaces`。表数据照常导出，但输出有噪音。

**解法**：加 `--no-tablespaces`。配套还有 `--single-transaction`（一致性，不锁表）与 `--skip-lock-tables`。

## 十、会话权限：WSL 可能一开始无权访问

DSH 会话早期访问 WSL 报 `Wsl/EnumerateDistros/Service/E_ACCESSDENIED`，`docker ps` 全空、数据库连不上，一度以为是环境坏了。**这不是沙箱限制，是 WSL 服务侧权限**，用户放开权限后立刻恢复。

教训：探测失败时先判断错误码来源——`E_ACCESSDENIED` 与「服务没起」是两回事，别据此下"环境坏了"的结论。

## 十一、`dubious ownership` 会让 git 拒绝一切命令

**现象**：`git status` / `git fetch` 全部报 `fatal: detected dubious ownership in repository`，而目录 root 完全可写。

**原因**：正式环境目录是 rsync 自宝塔容器来的，保留了混合属主（`www-data` / `www` / `huxu` / `root`）。git 认为目录所有者与当前用户不一致，判定为可疑并拒绝操作。这与 ADR-002 备选 C 记录的 WaterDrop 仓库问题是同一个。

**解法**：根治用 `chown -R root:root /root/www/typecho_prod`（服务本身以 root 跑，统一属主反而一致）；再在脚本里加一条豁免兜底，防止目录再次被以其他属主 rsync 进来：

```bash
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$DOCROOT" \
    || git config --global --add safe.directory "$DOCROOT"
```

## 十二、`.gitattributes` 漏了 `.sh`，WSL 会直接拒绝执行

上游 `.gitattributes` 只声明了 `*.php` / `*.js` / `*.css` / `*.html` / `*.xml` 的 `eol=lf`。但发布链路依赖 `.claude/scripts/*.sh`，**一旦以 CRLF 入库，正式环境 pull 下来执行就是 `bad interpreter: /bin/bash^M`**。

**解法**：补 `*.sh text eol=lf`、`*.py text eol=lf`、`*.md text eol=lf`。开发在 Windows、执行在 Linux 的项目，这个文件不是可选项。

## 附：可复用的探查命令

```bash
# 端口是否有人服务
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/

# 容器真实名字（filter 大小写敏感，直接看全表最稳）
docker ps -a

# 用 ID 进容器
docker exec <ID> mysql --version

# 配置项脱敏查看
sed -E "s/'password'\s*=>\s*'[^']*'/'password' => '<masked>'/" config.inc.php
```