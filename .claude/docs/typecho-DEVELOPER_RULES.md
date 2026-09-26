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
  └─ WSL "Android" (Ubuntu 20.04.6 LTS)
       ├─ Docker 28.1.1
       │   └─ mysql_test-mysql_test-1  (mysql:8.0.39, 13307→3306)
       └─ PHP 8.2.28 Dev Server        (0.0.0.0:8000)
```

Windows 通过 WSL2 端口转发自动将 WSL 的 8000 映射到本机，浏览器直接访问 `localhost:8000`。

### 启动流程

#### Step 1 — 启动 WSL

```bash
wsl -d Android
wsl -l -v    # 确认状态为 Running
```

> ⚠️ 发行版名称 `Android` 有误导，实际是 **Ubuntu 20.04.6 LTS**，内含 PHP 8.2 + Docker，与 Android 模拟器无关。

#### Step 2 — 启动 MySQL 容器

```bash
wsl -d Android -- docker start mysql_test-mysql_test-1
wsl -d Android -- docker ps --filter name=mysql_test
# 期望输出: Up, 0.0.0.0:13307->3306/tcp
```

容器 root 密码通过环境变量 `MYSQL_ROOT_PASSWORD` 注入（见下方账号表），**不预建业务库**。

#### Step 3 — 启动 PHP Dev Server

```bash
wsl -d Android -- bash -c \
  'cd /mnt/e/deepseek_work/typecho && \
   setsid nohup php -S 0.0.0.0:8000 -t . > /tmp/php-server.log 2>&1 < /dev/null &'
```

确认监听：
```bash
wsl -d Android -- ss -tlnp | grep :8000
# 期望: LISTEN 0 4096 0.0.0.0:8000 ...
```

#### Step 4 — 验证

| 验证项 | 方法 | 期望 |
|---|---|---|
| 前台 | 浏览器打开 `http://localhost:8000/` | 200，标题 "Hello World" |
| 后台 | 浏览器打开 `http://localhost:8000/admin/` | 跳转登录页 |
| 安装重定向 | 浏览器打开 `http://localhost:8000/install.php` | 302 → `/`（已安装） |
| 数据库连通 | `wsl -d Android -- php /mnt/e/deepseek_work/typecho/.claude/tmp/verify_install.php` | 7 张表 + `installed=1` |

### 账号密码汇总

| 用途 | 地址 | 用户名 | 密码 |
|---|---|---|---|
| MySQL root（容器管理用） | 127.0.0.1:13307 | `root` | `2SsNbn3EwPdMKdDk` |
| MySQL 应用用户（Typecho 连接） | 127.0.0.1:13307 | `typecho` | `typecho_dev_2026` |
| Typecho 管理员后台 | http://localhost:8000/admin/ | `admin` | `admin123` |

### config.inc.php 关键字段

```php
$db = new \Typecho\Db('Pdo_Mysql', 'typecho_');
$db->addServer(array (
  'host'      => '127.0.0.1',
  'port'      => 13307,
  'user'      => 'typecho',
  'password'  => 'typecho_dev_2026',
  'charset'   => 'utf8mb4',
  'database'  => 'typecho',
  'engine'    => 'InnoDB',
  'sslVerify' => false,
), \Typecho\Db::READ | \Typecho\Db::WRITE);
```

### 数据库表结构

安装完成后自动创建 7 张表（前缀 `typecho_`）：

```
typecho_comments     评论
typecho_contents     文章/页面
typecho_fields       用户附加字段
typecho_metas        分类/标签
typecho_options      站点配置
typecho_relationships 文章-分类关联
typecho_users        用户
```

### 重新安装

若需从零重装：

```bash
# 1. 删除 config.inc.php（让它回到未安装状态）
rm E:\deepseek_work\typecho\config.inc.php

# 2. 清空数据库
wsl -d Android -- docker exec -e MYSQL_PWD=2SsNbn3EwPdMKdDk mysql_test-mysql_test-1 \
  mysql -uroot -e "DROP DATABASE IF EXISTS typecho; CREATE DATABASE typecho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. 重建用户（ALTER USER 重置密码，CREATE USER 的 IDENTIFIED BY 在 sh -c 中不可靠）
wsl -d Android -- docker exec -e MYSQL_PWD=2SsNbn3EwPdMKdDk mysql_test-mysql_test-1 \
  mysql -uroot -e "CREATE USER IF NOT EXISTS 'typecho'@'%' IDENTIFIED BY 'typecho_dev_2026'; ALTER USER 'typecho'@'%' IDENTIFIED BY 'typecho_dev_2026'; GRANT ALL ON typecho.* TO 'typecho'@'%'; FLUSH PRIVILEGES;"

# 4. 用 curl 完成三步安装（浏览器 AJAX 有兼容问题，curl 更稳定）
#    Step 1: 环境检查（POST 空表单即可）
curl -s -X POST http://127.0.0.1:8000/install.php -d 'step=1'
#    Step 2: 数据库配置
curl -s -X POST http://127.0.0.1:8000/install.php \
  -d 'step=2&dbAdapter=Pdo_Mysql&dbPrefix=typecho_&dbHost=127.0.0.1&dbUser=typecho&dbPassword=typecho_dev_2026&dbDatabase=typecho&dbPort=13307&dbCharset=utf8mb4&dbEngine=InnoDB&dbSslVerify=off&dbNext=none'
#    Step 3: 管理员账户
curl -s -X POST http://127.0.0.1:8000/install.php \
  -d 'step=3&userUrl=http://localhost:8000&userName=admin&userPassword=admin123&userMail=admin@localhost.local'
```

### 已知坑

1. **WSL 发行版名称误导**：`Android` 实际是 Ubuntu 20.04.6 LTS，与 Android 模拟器无关。
2. **MySQL `CREATE USER ... IDENTIFIED BY` 密码不生效**：在 `docker exec sh -c` 环境下，`IDENTIFIED BY` 的密码可能被 shell 吞掉特殊字符。首次建用户后**必须**用 `ALTER USER` 重置一次才能生效。
3. **`config.inc.php` 不进 git**：该文件由 `install.php` 自动生成，已在 `.gitignore` 中。
4. **安装状态持久化**：`typecho_options.installed=1` 后，`install.php` 自动重定向到首页。重新访问 `install.php` 不会再次进入安装向导。
5. **agent-browser 无法触发 AJAX 表单**：install.php 的表单提交通过 jQuery AJAX + FormData 实现，agent-browser 的按钮点击无法正确拦截 `form.submit` 事件。改用 `curl -X POST` 直接提交表单数据。
6. **端口 13307 非标准**：MySQL 容器映射到宿主机 `13307` 而非默认 `3306`，连接时务必指定端口。

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
- **PHPUnit 引入状态**：未引入；OQ-002 待决策。
- **本地快速验证**：`cd tools && make test`（语法检查）或 `for i in $(find . -name '*.php'); do php -l $i; done | grep -v 'No syntax errors detected'`。
- **集成测试**：手动在本地环境装一个 Typecho，跑 `install.php` 流程，验证 4 种数据库适配。