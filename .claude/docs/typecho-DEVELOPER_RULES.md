# Typecho 开发规则（非代码层）

> 模块依赖 / 构建系统 / Git 规范 / 环境变量 / CI 矩阵。本文件与 `CLAUDE.md` 互补：CLAUDE.md 是代码层规范，本文件是构建/CI/依赖层规则。

## 模块依赖

### 运行时依赖

Typecho **不依赖 Composer**，无第三方 PHP 框架。所有能力均为自研：

| 依赖 | 类型 | 说明 |
|---|---|---|
| PHP 7.4.0+ | 解释器 | 必需；CI 矩阵测试 7.4 / 8.0 / 8.1 / 8.2 |
| 数据库 | 运行时 | MySQL / MariaDB（5.5.3+）/ PostgreSQL（9.1+）/ SQLite（3.7.11+）**任选其一** |
| Web 服务器 | 运行时 | nginx / Apache，推荐 PHP-FPM（Dockerfile 已陈旧，勿用其内置 nginx） |

### 构建期依赖

构建工具在 `tools/` 目录下：

| 工具 | 用途 | 触发 |
|---|---|---|
| `Makefile` | git shallow clone + CSS/JS 压缩 + `php -l` + tar.gz 打包 | `make update` / `make package` / `make install` / `make theme` / `make upgrade` / `make langs` / `make pot` / `make test` |
| `Dockerfile` | 老镜像（Ubuntu 16.04 + PHP 7.0 + 自编译 nginx） | **已陈旧，新部署勿用** |
| `build.js` | Node 18 工具，CSS/JS 压缩（uglify-js + node-sass + sprite-magic-importer + @picocss/pico） | `npm run build_js` / `build_css` / `build_css:theme` |
| `build_pot.php` | i18n POT 文件生成 | `make pot` |
| `yuicompressor-2.4.2.jar` | CSS/JS 压缩（Java） | `make update` 时使用 |

### Node 依赖（仅构建）

`tools/package.json`：

| 包 | 版本约束 | 用途 |
|---|---|---|
| `@picocss/pico` | ^2.0.6 | CSS 类（若需） |
| `chalk` | ^4.0.0 | 终端彩色输出 |
| `node-sass` | ^9.0.0 | SCSS 编译 |
| `sprite-magic-importer` | ^1.6.2 | 雪碧图 |
| `uglify-js` | ^3.11.6 | JS 压缩 |

`engines.node = "18.x"`。

### 用户态扩展

| 路径 | 用途 |
|---|---|
| `usr/plugins/<Name>/Plugin.php` | 插件，钩子挂在 `Typecho\Plugin::factory('<hook_point>')` |
| `usr/themes/<theme>/` | 主题，含 `functions.php` / `index.php` / `header.php` / `footer.php` / `style.css` 等 |
| `usr/langs/<lang>.mo` | 语言包，由 `make langs` 拉取 `typecho/languages` 编译 |

`.gitignore` 已排除 `usr/uploads/` / `usr/*.db` / `usr/plugins/`（除 HelloWorld）/ `usr/themes/`（除 default 与 classic-22）。

## 构建系统

### 本地构建命令

```bash
# 编译 CSS/JS（需 Node 18）
cd tools
npm install
npm run build_js          # 压缩 JS
npm run build_css         # 压缩 admin CSS
npm run build_css:theme   # 压缩主题 CSS

# 仅语法检查（等价 make test）
for i in $(find var admin usr -name '*.php'); do php -l $i || exit 1; done

# i18n POT 文件生成
cd tools && make pot      # 输出 messages.pot

# 拉取语言包并编译
cd tools && make langs    # 拉取 typecho/languages 后 msgfmt 编译
```

### CI 构建

- **Dev CI**：`.github/workflows/Typecho-dev-Ci.yml`
  - 触发：`push` 或 `pull_request` 到 `master`，且提交信息不含 `skip ci`。
  - 矩阵：PHP 7.4 / 8.0 / 8.1 / 8.2 并行跑 `php -l` 语法检查。
  - 仅当 `push` 到 `typecho/typecho` 仓库（非 PR）才触发 `build` job：
    1. `mkdir build`
    2. `cp -r LICENSE.txt index.php install.php admin install usr var build/`
    3. `mkdir build/usr/uploads/ && chmod 755 build/usr/uploads/`
    4. 删除 `build/admin/src` 和 `build/usr/themes/classic-22/static/scss`
    5. `cd build && zip -q -r typecho.zip * && mv typecho.zip ../ && cd -`
    6. 通过 `WebFreak001/deploy-nightly@v1.1.0` 上传到 nightly release（asset ID `49532662`）。

- **Release CI**：`.github/workflows/Typecho-release-Ci.yml`
  - 触发：`release: published`。
  - 步骤同 dev build（zip 而非 tar.gz），通过 `shogo82148/actions-upload-release-asset@v1` 上传。
  - 触发后通过 `WORKFLOW_TOKEN` 调 GitHub API 让 `typecho/languages` 仓库跑更新 workflow。

- **Hotfix Merge**：`.github/workflows/Typecho-hotfix-Merge.yml`（hotfix 分支自动合并到 master 的策略，按需查）

### 本地快速发版（手动）

```bash
# 1. 编译 CSS/JS
cd tools && npm install && npm run build_js && npm run build_css && cd ..

# 2. 语法检查
cd tools && make test && cd ..

# 3. 打包
cd tools && make package && cd ..
# 产物：tools/build.tar.gz（含 LICENSE.txt + index.php + install.php + admin + install + usr + var）
```

## 本地开发环境（WSL + Docker）

> 本节记录当前开发机的本地启动流程与全部账号密码，AI 接手时按此步骤可直接复现环境。

### 环境架构

```
Windows 主机 (E:\deepseek_work\typecho)
  └─ WSL "Android" (Ubuntu 20.04.6 LTS，名称有误导)
       ├─ Docker 28.1.1
       │   └─ mysql_test-mysql_test-1  (mysql:8.0.39, 13307→3306)
       └─ PHP 8.2.28 Dev Server        (0.0.0.0:8000)
```

Windows 通过 WSL2 端口转发自动将 WSL 的 8000 映射到本机，浏览器直接访问 `localhost:8000`。

> 完整调试信息（启动 / 验证 / 排障 / 管理员密码重置）见 `CLAUDE.md` §0.5，本节只补充它不承载的细节。

### 启动流程

#### Step 1 — 启动 WSL

```bash
wsl -d Android
wsl -l -v    # 确认状态为 Running
```

#### Step 2 — 启动 MySQL 容器

```bash
wsl -d Android -- docker start mysql_test-mysql_test-1
wsl -d Android -- docker ps --filter name=mysql_test
# 期望输出: Up, 0.0.0.0:13307->3306/tcp
```

#### Step 3 — 启动 PHP Dev Server

```bash
wsl -d Android -- bash -c \
  'cd /mnt/e/deepseek_work/typecho && \
   setsid nohup php -S 0.0.0.0:8000 -t . > /tmp/php-server.log 2>&1 < /dev/null &'
```

### 凭据现状（还原后实测）

> **本文件不记录明文口令**，只写「去哪儿取」。统一口径见 `CLAUDE.md` §0.7。

| 用途 | 去哪儿取 | 权限 |
|---|---|---|
| MySQL 应用用户（Typecho 连接） | 项目根 `config.inc.php` 的 `user` / `password` / `database` 三项 | 仅单库（本地库名见 §本地开发环境） |
| MySQL root | **无**——见下方说明 | 不可用 |
| Typecho 管理员 | 账号 `huxu`；口令**不可反解**（库中仅 phpass 哈希） | 按 `CLAUDE.md` §0.5 重置 |

**数据库**：本地库名见 §本地开发环境（8 张表 = 7 张 `typecho_*` + `typecho_wx_share`）
**站点**：Thron的博客 / Typecho 1.3.0 / 主题 WaterDrop / 321 篇内容 / `installed=1`

> ⚠️ **root 口令为何不可用**：datadir 是从 `mysql_WLzr` 容器整体还原的，其 `mysql.user` 表里 root 的哈希来自那套环境。容器 env 里的 `MYSQL_ROOT_PASSWORD` **只在镜像首次初始化 datadir 时生效**，datadir 被整体替换后该变量失效，实测用 env 密码登录报 `Access denied`。

### config.inc.php 关键字段

```php
$db = new \Typecho\Db('Pdo_Mysql', 'typecho_');
$db->addServer(array (
  'host'      => '127.0.0.1',   // 备份里是容器服务名，本地要改成 127.0.0.1
  'port'      => 13307,         // 备份里是容器内网 3306，本地用映射端口
  'user'      => '<应用用户名，取自线上 .env 的 MYSQL_USER>',
  'password'  => '<口令，取自线上 .env 的 MYSQL_PASSWORD>',
  'charset'   => 'utf8mb4',
  'database'  => '<库名，取自线上 .env 的 MYSQL_DATABASE，需与 lower_case_table_names 一致>',
  'engine'    => 'InnoDB',
  'sslCa'     => NULL,
  'sslVerify' => false,         // 备份里是 true，本地无 SSL 证书
), \Typecho\Db::READ | \Typecho\Db::WRITE);
```

### 备份还原流程（已验证）

本次从宝塔备份还原站点，完整步骤如下，供下次重放：

**Step 1 — 还原站点文件**

```bash
# 备份包结构：typecho_AGbF/{LICENSE.txt, .env, docker-compose.yml, data/}
# data/ 即站点根目录内容（var/ usr/ 等），用 --strip-components=2 剥掉两层前缀
wsl -d Android -- bash -c \
  'cd /mnt/e/deepseek_work/typecho && \
   tar -xzf "/mnt/f/1A开发备份/博客备份/typecho_AGbF_1790338087.tar.gz" \
         --strip-components=2 typecho_AGbF/data/'
```

**Step 2 — 还原 MySQL datadir**

```bash
# 注意：路径必须写死在 wsl 命令里，不能依赖 Windows 侧的 shell 变量
wsl -d Android -- docker stop mysql_test-mysql_test-1
wsl -d Android -- mv /www/dk_project/dk_app/mysql/mysql_test/data \
                   /www/dk_project/dk_app/mysql/mysql_test/data_before_restore

wsl -d Android -- bash -c \
  'mkdir -p /tmp/mysql_restore && cd /tmp/mysql_restore && \
   tar -xzf "/mnt/f/1A开发备份/博客备份/mysql_WLzr_1790338056.tar.gz" && \
   mkdir -p /www/dk_project/dk_app/mysql/mysql_test/data && \
   cp -a mysql_WLzr/data/* /www/dk_project/dk_app/mysql/mysql_test/data/'

wsl -d Android -- docker start mysql_test-mysql_test-1
```

**Step 3 — 修 my.cnf 的 includedir 路径**

原 `my.cnf` 写的是 `!includedir /etc/mysql/conf.d/`，但容器实际挂载点是 `/etc/mysql/mysql.conf.d`，路径不匹配会让 mysqld 启动即崩（`Can't read dir of '/etc/mysql/conf.d/[mysqld]'`）：

```bash
wsl -d Android -- sed -i 's|!includedir /etc/mysql/conf.d/|!includedir /etc/mysql/mysql.conf.d/|' \
  /www/dk_project/dk_app/mysql/mysql_test/my.cnf
wsl -d Android -- docker restart mysql_test-mysql_test-1
```

**Step 4 — 改 config.inc.php + 库内 siteUrl**

改 host/port/database/sslVerify（见上表），并把库里的旧穿透域名改成本地（凭据现取现用，见 `CLAUDE.md` §0.7）：

```bash
wsl -d Android -- php -r '$c=require "/mnt/e/deepseek_work/typecho/config.inc.php";
  $p=new PDO("mysql:host=127.0.0.1;port=13307;dbname={$c["db_name"]}",$c["db_user"],$c["db_password"]);
  $p->exec("UPDATE typecho_options SET value=\"http://localhost:8000\" WHERE name=\"siteUrl\"");'
```

不改 siteUrl 的后果：页面 CSS/JS 全部指向旧域名 `http://xkj88.e3.luyouxia.net:29026`，前台白屏。

**Step 5 — 验证**

```bash
# 前台 200 + 标题正确 + 数据库连通
curl -s http://localhost:8000/ | grep -o '<title>[^<]*</title>'
wsl -d Android -- php -r '$c=require "/mnt/e/deepseek_work/typecho/config.inc.php";
  $p=new PDO("mysql:host=127.0.0.1;port=13307;dbname={$c["db_name"]}",$c["db_user"],$c["db_password"]);
  echo $p->query("SELECT COUNT(*) FROM typecho_contents")->fetchColumn();'
```

### 已知坑

1. **WSL 发行版名称误导**：`Android` 实际是 Ubuntu 20.04.6 LTS，与 Android 模拟器无关。
2. **`MYSQL_ROOT_PASSWORD` 在 datadir 还原后失效**：该变量只在镜像首次初始化 datadir 时写入 root 密码；整体替换 datadir 后，容器 env 与 `mysql.user` 表不一致，env 密码无法登录。
3. **还原 datadir 会一并还原全部账号**：备份来自另一套环境，里面有 gitea 等无关库和多个混淆库名（本例 10 个库，站点库 `jbxfamr4fjr4ahaz` 只是其中之一）。还原后应用用户权限只覆盖站点库，其他库不可见。
4. **库名大小写**：备份 `.env` 里是 `Jbxfamr4fJr4AhAZ`，但 `lower_case_table_names=1`，实际库名是小写 `jbxfamr4fjr4ahaz`，`config.inc.php` 必须写小写否则连不上。
5. **siteUrl 决定静态资源域名**：站点数据存在 `typecho_options.siteUrl`，还原后不改会让所有 CSS/JS 指向旧域名，页面看起来加载失败。
6. **`skip-grant-tables` 下改密码不落盘**：实测 `UPDATE mysql.user ...`、`ALTER USER`、`CREATE USER` 均返回成功但 `authentication_string` 哈希未变，重启后凭据不生效。原因待查（见 glossary OQ-005），当前对策是直接使用备份中已存在的应用用户。
7. **my.cnf 的 includedir 路径**：写 `!includedir` 时行尾不要误写成 `.../conf.d/[mysqld]`，且目录名必须与容器挂载点一致（`mysql.conf.d`），否则 mysqld 启动即崩进重启循环。
8. **PowerShell 不支持 `<` 输入重定向**：`mysql ... < file.sql` 会在 PowerShell 侧报 `The '<' operator is reserved`。改用 `mysql -e "source /path/file.sql"`，或把命令写进 `.sh` 脚本再 `wsl ... bash script.sh`。
9. **agent-browser 无法触发 install.php 的 AJAX 表单**：install.php 用 jQuery `$.ajax` + `FormData` 提交，浏览器点击无法可靠拦截 `form.submit`；改用 `curl -X POST` 直接提交更稳。
10. **端口 13307 非标准**：MySQL 容器映射到宿主机 `13307` 而非默认 `3306`，连接时务必指定端口。

## Git 规范

- 仓库分支：`master`（唯一长期分支）；hotfix 分支按需临时创建（CI workflow `Typecho-hotfix-Merge.yml`）。
- 提交消息格式：遵循全局「Git 提交消息规范」（`TaskID: Title / Root Cause / Solution / Test Suggestion`，各段 ≤30 单词）。
- 禁止自动 commit：所有改动完成后由用户手动 `git add && git commit && git push`。
- PR 流程：fork → 创建特性分支 → 提 PR 到 `typecho/typecho:master`，自动跑 dev CI；PR 不直接触发 release。

## 环境变量 / 配置

- **数据库配置**：`config.inc.php`（**不进 git**），由 `install.php` 生成；包含数据库类型 / 主机 / 端口 / 用户名 / 密码 / 表前缀。
- **密钥与令牌**：Typecho 不使用外部 API 密钥；后台管理密码用 `PasswordHash`（`var/Utils/PasswordHash.php`）bcrypt 存储。
- **CI 密钥**：
  - `GITHUB_TOKEN`：dev CI 自动注入，用于上传 nightly。
  - `WORKFLOW_TOKEN`：release CI 用，调 `typecho/languages` 仓库 workflow 的 API。
- **新增加密配置**：禁止硬编码；走 `config.inc.php`（安装时写入）或 `.env`（若引入）；改完同步到本文件「环境变量」段。

## 测试

- **当前状态**：**仅 `php -l` 语法检查**，无单元测试（详见 `typecho-GAPS.md` §代码缺口）。
- **PHPUnit 引入状态**：未引入；选型待决策（工单 G1）。
- **本地快速验证**：`cd tools && make test`（语法检查）或 `for i in $(find . -name '*.php'); do php -l $i; done | grep -v 'No syntax errors detected'`。
- **集成测试**：手动在本地环境装一个 Typecho，跑 `install.php` 流程，验证 4 种数据库适配。