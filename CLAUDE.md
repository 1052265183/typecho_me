# Typecho — 代码开发规范（Claude 项目指令）

> 本文件是 Claude Code 在 Typecho 项目写代码时必须遵守的代码层规范。

## 0. 项目概况

- **语言/框架/版本**：PHP 7.4.0+（CI 矩阵 7.4 / 8.0 / 8.1 / 8.2）；自研 Widget 组件机制（无 Composer、无第三方框架依赖）；数据库 MySQL/MariaDB/PostgreSQL/SQLite 任选其一。
- **包名根/模块结构**：
  - 入口与安装：`index.php` / `install.php`
  - 后台：`admin/`
  - 核心库：`var/Typecho/`（Db / Router / Plugin / Http / I18n / Feed / Cookie / Config / Common / Validate / Widget 基类等）
  - 业务组件：`var/Widget/`（Archive / Comments / Feedback / Users / Metas / Options / Contents / Init / Backup 等）
  - 表单助手：`var/Widget/Helper/`
  - XML-RPC 协议：`var/IXR/`
  - 工具：`var/Utils/`（HyperDown Markdown / AutoP 自动段落 / PasswordHash / Helper / Upgrade）
  - 用户态：`usr/plugins/` / `usr/themes/` / `usr/langs/` / `usr/uploads/`
  - 构建工具链：`tools/`（Makefile + Dockerfile + build.js + build_pot.php + yuicompressor）
- **命名空间根**：`Typecho\` `Widget\` `Utils\` `IXR\`（PSR-4 风格，与目录结构一一对应）
- **标识符特殊拼写**：遵循 **PSR-4 + PSR-2**；类名大驼峰、文件名 = 类名；命名空间按目录反向映射。无 Typecho 特有的奇怪拼写。

| 项目前缀 | 项目短名 | 标识符驼峰 |
|---|---|---|
| `typecho-` | `typecho` | `Typecho` |

## 0.1 项目文档与上下文（强制）

- 新对话必须先读本文件 + `README.md`（AI 接手指南）建立全局认知。
- 改代码后必须更新本文件相关章节；若引入新概念、新决策，同步更新 `.claude/planning/glossary.md` 与 `.claude/planning/02-技术设计/ADR-xxx.md`。
- 架构/产品/依赖变更必须先写 ADR 沉淀，后动代码。

### 文档更新联动（强制，按表逐项检查）

产生或变更任何文档时，按本次改动类型逐行对照下表，每行完成判据满足才算结束；先按「文档更新技能纪律」加载 grill-with-docs + writing-for-agents 技能，再读现有文档、再动笔：

| 改动类型 | 必联动位置 | 完成判据 |
|---|---|---|
| 改代码 | 本文件对应章节 | 章节描述与代码实际行为一致 |
| 新技术决策 | `02-技术设计/ADR-NNN-<主题>.md` + `ADR-README.md` 索引表 | 索引表能查到该决策 |
| 新术语 / 新缩写 | `glossary.md` 术语或缩写表 | 新词有定义、有出处指针 |
| 新缺口 / 待办 / 开放问题 | `typecho-GAPS.md`（G/T/E 编号）或 `glossary.md` OpenQ（OQ 编号） | 有编号、有行动项，且 `03-任务拆解/工单清单.md` 有同号工单 |
| 踩坑复现型知识 | `README.md` §七常见坑（一行 + 指针） | 接手者照坑清单可避坑 |
| 状态类措辞变化 | 全局扫 stale：`planning/README.md` 当前状态、GAPS 对应条目、`README.md` §五 | grep 旧状态词（"尚未产生""索引为空""待补"等）无残留 |

**单一信源分层**（同一语义只在一处展开，其余放一行指针）：

- 行动指令（做什么）→ 本文件对应章节；决策与理由（为什么）→ ADR；术语定义 → `glossary.md`
- 跨文档引用用"触发词 + 指针"（如"决策与理由见 ADR-001"），指针措辞前置触发条件
- 交叉引用自查收尾：`README.md` §八文档地图、`ADR-README.md` 索引、`glossary.md` 三处互相指向成立

## 0.2 文档索引（完整，按目录遍历）

| 路径 | 内容 | 何时读 |
|---|---|---|
| `.claude/docs/typecho-DEVELOPER_RULES.md` | 模块依赖 / 构建系统 / 本地开发环境（WSL+Docker 启动流程+账号密码） / Git 规范 / 环境变量 | 改构建/依赖/CI/启动环境时 |
| `.claude/docs/typecho-GAPS.md` | 当前已知缺口（G1~Gn / T1~Tn / 外部依赖） | 动代码前必查 |
| `.claude/planning/README.md` | planning 总览（5 子目录职责） | 了解文档结构 |
| `.claude/planning/glossary.md` | 领域术语表 + OpenQ | 引入新术语/未决问题时 |
| `.claude/planning/01-需求分析/` | PRD / UE / 协议接口梳理 | 理解需求/协议时 |
| `.claude/planning/02-技术设计/ADR-README.md` | ADR 索引 | 查技术决策来源 |
| `.claude/planning/02-技术设计/架构图.md` | 模块关系图 | 看整体架构 |
| `.claude/planning/03-任务拆解/工单清单.md` | G/T/E/OQ 同号工单：状态总览 + 验收标准 + 依赖（P0~P2 分级） | 查「还有什么没做完」/ 开工单 / 改任务状态 |
| `.claude/planning/04-开发计划/` | 版本开发计划（路线图） | 规划版本 |
| `.claude/planning/05-参考资料/` | 外部文档链接 + 本地参考实现索引 | 找参考实现 |
| `.claude/plans/` | 临时执行计划（compile-xxx.md 等） | 当前会话在做的活 |
| `.claude/skills/` | 项目级 skill（SKILL.md） | 项目特定工作流 |
| `.claude/scripts/` | 辅助脚本（`_xxx.py` / `_xxx.sh`） | 跑一次性脚本 |
| `.claude/bugs/<bugId>/bug_detail.txt` | bug 记录 | 排查 bug 时 |
| `.claude/tmp/` | 临时文件（不进 git） | 调试草稿 |
| `.claude/screenshots/` | 截图（`ref_` / `dev_` / `v<N>_` 前缀） | 视觉对比 |
| `.claude/ui-dumps/` | UI dump（XML） | 排查前端层级 |

仓库内 GitHub 平台契约件（**不进 AI 文档结构**，保留原位）：

| 路径 | 用途 |
|---|---|
| `README.md` | 项目全景（已重写为 AI 接手指南） |
| `CONTRIBUTING.md` | 社区贡献指南 |
| `CODE_OF_CONDUCT.md` | 社区公约 |
| `SECURITY.md` | 安全报告策略（security@typecho.org） |
| `LICENSE.txt` | GPL 2.0 |
| `.github/ISSUE_TEMPLATE/` | Bug / Feature / Enhancement 模板 |
| `.github/PULL_REQUEST_TEMPLATE/` | PR 模板 |
| `.github/workflows/` | Typecho-dev-Ci / Typecho-hotfix-Merge / Typecho-release-Ci |

## 0.3 分析问题禁止瞎猜（强制）

- 先读本文件 §0.2 文档索引与 `.claude/docs/typecho-GAPS.md`；
- 改协议/接口字段前先读 `.claude/planning/01-需求分析/` 与 [docs.typecho.org](http://docs.typecho.org/)；
- 代码查实际实现：用 Read 实际源码，不凭文档描述猜逻辑；
- 实在找不到实现逻辑、查用户补充（给选项 + 依据），用户确认后按 writing-for-agents 归档。

## 0.4 当前已知缺口（强制）

- 动代码前必须先对 `.claude/docs/typecho-GAPS.md`（背景与理由）与 `.claude/planning/03-任务拆解/工单清单.md`（状态、验收标准、依赖）；
- 已知缺口分三类：**代码缺口** G1~G6（影响正确性）、**待办** T1~T5、**外部依赖** E1~E4；三类编号与工单清单一一对应；
- 唯一未结的开放问题是 **OQ-005**（`skip-grant-tables` 不落盘），跟踪见工单清单同号条目。

## 0.5 快速调试（冷启动 → 验证 → 常见故障）

> 本节让新对话**只读 CLAUDE.md** 即可启动、验证、排查项目。完整流程（重装、重建数据库等）见 `.claude/docs/typecho-DEVELOPER_RULES.md` §本地开发环境。

### 环境拓扑

```
Windows 主机 (E:\deepseek_work\typecho)
  └─ WSL "Android" (Ubuntu 20.04.6 LTS, 名称有误导)
       ├─ Docker 28.1.1 → mysql_test-mysql_test-1 (mysql:8.0.39)
       │                    宿主机端口 13307 → 容器 3306
       └─ PHP 8.2.28 Dev Server → 0.0.0.0:8000
```

Windows 通过 WSL2 端口转发访问，浏览器直接 `localhost:8000`。

> 本节只管**本地开发**。正式环境（博客「Thron的博客」）跑在同一台机器的 WSL 里，端口 `:8001`，与开发环境**共用同一批 Docker 容器但库不同**——发布与排障见 §0.6。

### 一键启动

```bash
# Step 1: 确认 WSL 运行中
wsl -l -v    # "Android" 行状态应为 Running

# Step 2: 启动 MySQL 容器（若已运行则跳过）
wsl -d Android -- docker start mysql_test-mysql_test-1

# Step 3: 启动 PHP Dev Server（若已运行则跳过）
wsl -d Android -- bash -c \
  'cd /mnt/e/deepseek_work/typecho && \
   setsid nohup php -S 0.0.0.0:8000 -t . > /tmp/php-server.log 2>&1 < /dev/null &'

# Step 4: 验证（全部通过才算就绪）
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
# → 200 = 前台正常

# 验证数据库连通（凭据现取现用，详见 §0.7）
wsl -d Android -- php /mnt/e/deepseek_work/typecho/.claude/scripts/_db_check.php
# → 8.0.39 = 数据库连通
```

### 关键信息速查

| 项目 | 值 |
|---|---|
| 前台 | http://localhost:8000/ |
| 后台 | http://localhost:8000/admin/ |
| 安装向导 | http://localhost:8000/install.php （已安装 → 302 到 `/`） |
| MySQL | 127.0.0.1:13307 |
| PHP Server 日志 | WSL 内 `/tmp/php-server.log` |
| 数据库凭据 | **不记明文**——读项目根 `config.inc.php` 的 `db_user` / `db_password` / `db_name`，见 §0.7 |
| MySQL root 口令 | **不可用**——datadir 还原自 `mysql_WLzr` 备份，容器 env 的 `MYSQL_ROOT_PASSWORD` 只在首次初始化生效，还原后失效 |
| Typecho 管理员 | `huxu` / **密码不可反解**（库中仅 phpass 哈希；重置见下方「管理员密码重置」） |
| config.inc.php | 位于项目根目录，不进 git，由 install.php 自动生成 |

### 常见故障速查

| 症状 | 原因 | 解决 |
|---|---|---|
| `localhost:8000` 超时 | PHP Server 未启动或 WSL 未运行 | `wsl -l -v` 确认 Running；重跑 Step 3 |
| MySQL 连接被拒 | 容器未运行 | `wsl -d Android -- docker start mysql_test-mysql_test-1` |
| `Access denied for user ...` | 密码错误或容器未运行 | 用 `config.inc.php` 的 `db_user` / `db_password` 核对（§0.7）；确认容器运行 |
| install.php 不进向导 | `typecho_options.installed=1` | 见 DEVELOPER_RULES 重装步骤 |
| agent-browser 表单不提交 | jQuery AJAX 兼容问题 | 用 `curl -X POST` 代替浏览器提交 |

### 管理员密码重置

Typecho 管理员密码是 phpass 哈希（`$P$` 开头）存于 `typecho_users`，**不经 MySQL**，所以不需要 root 权限。写操作是写库，用 `.claude/scripts/_mysql_query.py` 的只读护栏会被拦，需直接执行；凭据现取现用（见 §0.7）：

```bash
# 1. 生成新哈希（把 newpass 换成你要设的密码）
wsl -d Android -- php -r 'require "/mnt/e/deepseek_work/typecho/var/Utils/PasswordHash.php";
  $h = new \Utils\PasswordHash(8, true); echo $h->hashPassword("newpass");'

# 2. 写回数据库（应用用户即可，无需 root）。先从 config.inc.php 解析出凭据，
#    再用容器内 mysql 客户端执行 UPDATE，避免命令行出现明文口令
wsl -d Android -- php /mnt/e/deepseek_work/typecho/.claude/scripts/_db_check.php
#   ↑ 先确认能连库；实际 UPDATE 用 _mysql_query.py 去掉只读护栏的版本执行
```

> ⚠️ **MySQL root 口令无法自助获取**：应用用户仅有单库权限，读不了 `mysql.user`；root 口令因 datadir 还原而不可知。若必须改 MySQL 账号口令，需走 `skip-grant-tables` 流程，且实测该模式下 `UPDATE` / `ALTER USER` 均不落盘（哈希未变），需先解决该问题——见 `.claude/planning/glossary.md` OQ-005。

## 0.6 发布正式环境

> 触发词：发布、部署、上线、把代码更新到正式环境。
> 与 §0.5 的分工：§0.5 管**本地开发**，本节管**正式环境**。决策与理由见 ADR-003，日常命令见 `typecho-DEVELOPER_RULES.md` §正式环境，踩坑见 `typecho-经验-WSL本地正式环境.md`。

### 0.6.1 拓扑

| 角色 | 位置 | 说明 |
|---|---|---|
| 开发目录 | `E:\deepseek_work\typecho`（Windows） | 编辑 + commit |
| 发布中转 | `E:/deepseek_work/typecho-bare.git` | bare 仓库，Windows 与 WSL 均可访问 |
| 正式环境 | `/root/www/typecho_prod`（WSL ext4） | git 工作副本，服务跑在 `:8001` |
| 数据库 | 容器 `mysql_wlzr-mysql_WLZr-1` → `127.0.0.1:13306` | 复用未迁移；库名**大写** `Jbxfamr4fJr4AhAZ` |
| Web 服务 | `php -S 0.0.0.0:8001` + 项目根 `router.php` | 4 worker，无 nginx |

### 0.6.2 发布流程（三步）

```bash
# 1. 开发目录：提交并推送（Windows 侧 E:\deepseek_work\typecho 执行）
git add -A && git commit -m "..." && git push bare master

# 2. 正式环境：预演（只读，显示将变动的提交与文件）
bash .claude/scripts/_git_pull_prod.sh

# 3. 正式环境：实际发布
bash .claude/scripts/_git_pull_prod.sh --apply
```

发布脚本做四件事：`fetch` → `reset --hard bare/master` → 复核受保护路径 → `php -l` 语法检查。

### 0.6.3 硬约束（违反即事故）

- **发布前必须先 commit**。git 方式强制这一点，杜绝"改了没提交、发布的是旧代码"这类误发布——这正是 rsync 方式的固有漏洞。
- **`config.inc.php` 与 `usr/uploads/` 永不参与 git**（`.gitignore` 排除），`reset --hard` 既不创建也不删除它们。前者是正式环境独立配置，后者是用户数据。脚本每次发布都会复核这两项，缺失即判定发布失败。
- **不要用 `rsync` 做日常发布**。`_deploy_prod.sh`（rsync 版）保留仅供一次性全量覆盖，它靠 exclude 规则保护上述两个路径，多一条规则就多一分出错空间；git 用 `.gitignore` 从机制上排除，更稳。
- **发布后无需重启服务**。`php -S` 每次请求都重新解析文件。
- **服务由 WSL 内 systemd 管理，不要手工抢端口**。`typecho-prod.service` 随 WSL 启动自动拉起（`systemctl status typecho-prod`），`Restart=always` 会在崩溃后自愈。调试时若要临时停，用 `systemctl stop typecho-prod`；**不要**直接 `php -S` 或 `_prod_ctl.sh start`，否则与 systemd 抢 8001 端口。`_prod_ctl.sh` 仅在未安装 systemd 时作为手工启停手段保留——它的 `start` 会先等数据库容器就绪，避免抢跑导致全站 503。
- **不配 Windows 开机自启**。WSL 启动则服务自动就绪；但 Windows 冷启动后 WSL 本身不会自启，博客会保持下线直到你打开 WSL。这是有意取舍，不是故障（决策见 ADR-003）。
- **备份落 F 盘，变化驱动**。`typecho-backup.timer` 每 6 小时检查一次（`systemctl list-timers typecho-backup`）；脚本先算数据指纹，**无变化直接退出不产包**，有变化才打 zstd 包到 `F:\1A开发备份\博客备份`，滚动保留最新 3 份。手工补备份用 `_backup_prod.sh`（`--status` 看是否会备份、`--list` 列出、`--force` 强制）。备份必须落在 F 盘而非 WSL 磁盘——本机盘故障时才救得回来。
- **主题改动必须浏览器实测**。`php -l` 只查 PHP 层，`</script>` 闭合缺失等 HTML 层问题只有真实整页加载能暴露——与 §3 主题 PJAX 纪律同理。
- **不要在正式环境直接改代码**。正式环境应是 git 工作副本的干净检出（`git status` 应为 0 项）；手工改动会在下次 `reset --hard` 时被静默丢弃。

### 0.6.4 验证

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/                    # 首页
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/admin/login.php       # 后台
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/index.php/feed/       # RSS（含全部文章）
```

> **注意**：`siteUrl`（`xkj88.e3.luyouxia.net:29026`）存在数据库 options 表里，不随代码同步。穿透仍指向旧端口时，用 `localhost:8001` 打开页面，静态资源仍会按 `siteUrl` 指向穿透域名加载旧环境资源——这是预期的，HTML 结构本身可正常验证。

### 0.6.5 回滚

```bash
# 开发侧：把上一提交推上去
git push bare <上一提交号>:master

# 正式环境：拉取并复位
bash .claude/scripts/_git_pull_prod.sh --apply
```

数据回滚另算。备份在 `F:\1A开发备份\博客备份`，任意一个包都是自包含完整快照：

```bash
# 数据库（解压后直接喂给 mysql）
zstd -dc typecho_db_<时间戳>.sql.zst | docker exec -i <容器ID> mysql -u<用户> -p<库名>
# uploads（恢复到正式目录，先备份现有目录）
zstd -dc typecho_uploads_<时间戳>.tar.zst | tar -xf - -C /root/www/typecho_prod/usr/uploads
# 校验包完整性
zstd -t typecho_*.zst
```

用 `bash .claude/scripts/_backup_prod.sh --list` 列出可用包。

### 0.6.6 旧宝塔 Docker 环境（2026-10-06 起弃用，仅回滚参考）

以下信息**仅在需要回滚到旧环境时才查**，日常发布一律不用。

| 项 | 值 |
|---|---|
| 容器 | `typecho_agbf-typecho_AGbF-1`，镜像 `joyqi/typecho:1.2.1-php8.0-apache`，端口 `22380` |
| 数据目录 | `/www/dk_project/dk_app/typecho/typecho_AGbF/data`（bind mount 到容器 `/app`） |
| 快照 | `…/typecho_AGbF/snapshots/20260928/`（tar.gz + .sha256 + .manifest 三件套） |
| 写入通道 | 仅宝塔面板 Bash——服务器 SSH 未运行（root 配了"仅密钥登录"但无密钥），`scp`/`rsync` 不可用 |

> **该环境的三个坑（已由 ADR-003 规避，留档以防重蹈）**：① base64 分块传输会把单词劈开，块边界落进文件中间导致浏览器报语法错误，而"暂存区 vs 目标区"哈希比对两边一起错、全部显示 OK——闸门必须卡在本地原件上做字节数 + 行数 + sha256 三方比对；② `cp -p` 保留的是暂存区文件属主（root）而非目标区原有的，复制后需 `chown`/`chmod` 显式还原；③ 跨环境比哈希前，Windows 侧必须做 CRLF→LF 归一化，二进制文件（png/woff/ttf）跳过归一化，否则全盘误判差异。

## 0.7 凭据存放与获取（不写值，只写去哪儿取）

> **本文件不记录任何明文密码**。需要凭据时按下表去对应位置取，取不到再看「取不到怎么办」。

| 凭据 | 去哪儿取 | 备注 |
|---|---|---|
| 本地 Typecho 数据库账号/密码/库名 | 项目根 `config.inc.php`（不进 git，由 install.php 生成） | 有 `db_user` / `db_password` / `db_name` 三项；MySQL 应用用户仅有该库权限 |
| 本地 MySQL 应用用户口令 | 同上 `config.inc.php` 的 `db_password`，或 `env | Select-String "TYPECHO_DB"` 查已设的环境变量 | 也可用 `.claude/scripts/_mysql_query.py`，它只认 `TYPECHO_DB_USER` / `TYPECHO_DB_PASS` 环境变量 |
| 正式环境数据库凭据 | 正式环境 `/root/www/typecho_prod/config.inc.php`（与开发环境各自独立，不进 git）；容器侧另有 `/www/dk_project/dk_app/typecho/typecho_AGbF/.env` 的 `MYSQL_*` | 本机即可取，无需登服务器 |
| MySQL root 口令 | **无**——datadir 从 `mysql_WLzr` 备份还原，容器 env 的 `MYSQL_ROOT_PASSWORD` 只在首次初始化生效 | 见 §0.5 管理员密码重置；改 root 口令的阻塞见 glossary OQ-005 |
| Typecho 管理员账号 | `huxu`（口令不可反解，库中仅 phpass 哈希） | 重置走 §0.5「管理员密码重置」，无需 root |

**取不到怎么办**：不要把口令写进任何文档或脚本。设环境变量后用脚本读，或临时用 `config.inc.php` 现取现用；确实需要新建口令时，用 §0.5 的重置流程生成。

---

## 1. 架构分层与请求流

- **入口流**：`index.php` 第 17~23 行：`\Widget\Init::alloc()`（初始化）→ `\Typecho\Plugin::factory('index.php')->call('begin')`（begin 钩子）→ `\Typecho\Router::dispatch()`（路由分发）→ end 钩子。
- **路由**：`var/Typecho/Router.php` `match()` 按路径匹配路由表，返回 `Widget::widget($route['widget'], ...)` 实例化。
- **组件基类**：`var/Typecho/Widget.php`（551 行），所有 widget 继承之；`Widget::widget()` 用对象池管理。
- **后台独立入口**：`admin/` 下若干 PHP 页面（40+ 文件），各自直接走 Widget 链路。
- **插件钩子**：通过 `Typecho\Plugin::factory()` 注册；插件入口位于 `usr/plugins/<Name>/Plugin.php`。

## 2. 命名规范

- **类/文件名**：大驼峰、文件名 = 类名（含命名空间路径），遵循 PSR-4。
- **命名空间**：与目录反向映射，`var/Typecho/Db/Adapter/Pdo/Mysql.php` → `Typecho\Db\Adapter\Pdo\Mysql`。
- **方法/属性**：小驼峰；私有/保护成员按上下文命名（不必强制下划线前缀）。
- **禁止全限定类名**：方法签名、变量、常量等一律 `use` 后用短名；同文件冲突除外。
- **if 必须加花括号**：单行 if 也禁止（即使 `if ($x) return $y;` 也写成块）。
- **注释**：用中文；只在关键逻辑、业务规则、规避过的坑、魔法数字处加；不解释「做什么」（详见全局注释规则）。
- **@property 注解**：`Widget` 基类大量使用 `@property` 标注魔术属性，子类继承后 IDE 可识别。

## 3. 插件与主题开发规约

- **插件**：`usr/plugins/<PluginName>/Plugin.php`（在用示例 `TinyMceForTypecho/Plugin.php`）；实现 `\Typecho\Plugin\PluginInterface`；通过 `Typecho\Plugin::factory('<hook_point>')` 挂载钩子。插件目录已纳入版本控制（各插件的 `logs/` 与 `bak/` 除外）。
- **主题**：`usr/themes/<theme_name>/`；至少含 `functions.php` / `index.php` / `header.php` / `footer.php` / `comments.php` / `404.php` / `page.php` / `post.php` / `style.css`；可选 `screenshot.png`。
- **主题 PJAX 脚本纪律（WaterDrop 实践，决策与理由见 ADR-001）**：WaterDrop 启用 PJAX（只替换 `title/meta/header/#main`），`footer.php` 内联脚本只在整页加载执行一次。给主题加 DOM 注入型功能必须遵守：
  1. **注入抽函数**：注入逻辑封装成函数，整页加载调一次、`pjax:complete` 里再调一次，已注入的元素跳过防重复；
  2. **复杂逻辑外置 + 委托**：交互逻辑放 `static/js/` 独立文件（IIFE + `window.__XXX_LOADED` 标记防重），事件用 `document` 委托绑定（`#main` 内直绑随 PJAX 换页失效）；剪贴板类功能必须带 `document.execCommand("copy")` 兜底（http 下 `navigator.clipboard` 静默失败）；
  3. **首屏 fail-open**：内联脚本开头先带 null 保护地隐藏 `#loader`、显示 `#body`，后续任何 JS 报错都不卡"数据加载中"首屏；
  4. **浏览器实测**：`php -l` 只查 PHP 层，`</script>` 闭合缺失等 HTML 层问题只有真实浏览器整页加载能暴露——主题改动后必须浏览器验证。
- **语言包**：`usr/langs/<lang>.mo`（由 `tools/Makefile langs` 拉取 `typecho/languages` 编译）；源代码用 `tools/build_pot.php` 生成 `messages.pot`。

## 4. 构建与发版

- **CI 测试**：`.github/workflows/Typecho-dev-Ci.yml` 在 `master` 分支 push/PR 上跑 `php -l` 语法检查（PHP 7.4 / 8.0 / 8.1 / 8.2 矩阵）；push 到主仓库（非 PR）自动打包并上传到 nightly release（asset ID `49532662`）。
- **发布构建**：`.github/workflows/Typecho-release-Ci.yml` 在 `release: published` 时构建 `typecho.zip` 并触发语言仓库构建。
- **本地构建工具**（在 `tools/` 下，详见 `typecho-DEVELOPER_RULES.md`）：
  - `Makefile`：git shallow clone → CSS/JS 压缩 → `php -l` 语法检查 → `tar.gz` 打包。
  - `Dockerfile`：Ubuntu 16.04 + 自编译 nginx 1.10.2 + PHP 7.0.14 + MySQL（**已陈旧**，新部署勿用）。
  - `build.js`（Node 18，依赖 uglify-js + node-sass + sprite-magic-importer）：`npm run build_js` / `build_css` / `build_css:theme`。
  - `build_pot.php`：i18n POT 文件生成（`make pot`）。
  - `yuicompressor-2.4.2.jar`：CSS/JS 压缩（`Makefile` 用）。

## 5. 测试与 CI

- 当前 CI 只跑 `php -l` 语法检查，**无单元测试**（详见 `typecho-GAPS.md`）。
- 本地快速检查：`for i in $(find var admin usr -name '*.php'); do php -l $i || exit 1; done`（等价 `make test`）。

## 6. 安全与合规

- **协议**：GPL 2.0（`LICENSE.txt` + `tools/package.json` 已声明 `GPL-2.0-only`）；二次分发须保留协议与版权声明。
- **密钥**：不硬编码密钥、不在文档里写明文口令。数据库口令靠 `config.inc.php`（不进 git）；脚本从 `TYPECHO_DB_USER` / `TYPECHO_DB_PASS` 等环境变量读；需要凭据时按 §0.7 标注的来源现取现用。
- **入口校验**：`index.php` 第 11 行先尝试 `config.inc.php`，缺失则跳转 `install.php`；新模块切勿绕过此机制。
- **提交前**：跑完全局安全检查 8 项（硬编码密钥 / 输入验证 / SQL 注入 / XSS / CSRF / 鉴权 / 速率限制 / 错误信息脱敏）。

## AI 协作约定

> 所有 AI 协作约定（输出语言、注释、全限定类名、if 花括号、Python 优先、
> library_test 隔离、Android 子包目录、Git 提交授权与模板、Hook 系统、
> Skill 执行纪律、Agent 编排……）以 AIX-WORK 插件本会话已加载的全集规则为准。
> 本文件不复述，避免与权威信源漂移。需要概览时用 `aix_work_diag` 工具查询。