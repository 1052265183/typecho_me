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