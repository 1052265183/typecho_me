# Typecho 在 WSL 里的启动流程（PHP 内置 server + SQLite）

## 背景

在 WSL 虚拟机里把 Typecho（上游官方仓库的本地镜像）跑起来，供本地开发与浏览。
开发机为 Windows 11 + WSL2（默认发行版 OS 实为 Ubuntu 20.04.6 LTS，winget 显示名
「Android」是 PowerShell GBK 渲染问题）。目标：浏览器访问 `http://localhost:8000`
即可走 Typecho 4 步安装引导。

## 环境前置

| 项 | 要求 | 本机状态 |
|---|---|---|
| WSL2 | 任何发行版 | Ubuntu 20.04.6 LTS |
| PHP | 7.4+ | 8.2.28 (cli) NTS（直接预装） |
| PHP `pdo_sqlite` 扩展 | 必需 | 已预装（grep 别名注意） |
| PHP `pdo_mysql` / `mysqli` | 可选（仅切 MariaDB 时用） | 已预装 |
| 数据库 | 任选 | SQLite 文件型（无服务进程） |
| Web server | 任选 | PHP 内置 `php -S`（无额外服务） |
| sudo | 免密码 | 是 |

## 启动步骤（最简路径）

### 1. 探测环境

```bash
# WSL 内核版本（确认是 WSL2）
wsl --status

# WSL 内部 PHP 与关键扩展
wsl bash -c "php -v && php -m | grep -iE '^(pdo_sqlite|sqlite3|json|mbstring|xml)$'"

# 现有项目状态（确认 config.inc.php 未生成）
wsl bash -c "ls -l /mnt/e/deepseek_work/typecho/config.inc.php 2>/dev/null || echo no config"
```

> ⚠️ **grep 坑**：第一次探测用 `grep -iE '^(pdo|sqlite|...)'` 时，`pdo_sqlite` / `pdo_mysql`
> 没匹配出来，只显示了 `PDO`（基类）。原因是 `php -m` 输出含表格字符导致行首多了空格，
> `^pdo_sqlite` 锚定失败。第二次精确 grep `^(pdo_sqlite|sqlite3|pdo_mysql|...)$` 才匹全。
> 教训：**探测关键模块用精确锚定 + 显式列举**，不要写缩写模式。

### 2. 创建可写目录

```bash
wsl bash -c "mkdir -p /mnt/e/deepseek_work/typecho/usr/uploads"
```

### 3. 后台启动 PHP 内置 server

```bash
# 用 wsl bash -c 包装（PowerShell 不能直接 && wsl 串联）
wsl bash -c "cd /mnt/e/deepseek_work/typecho && php -S 0.0.0.0:8000"
```

> 必须 `cd` 到项目根再启动 `-S`，否则 docroot 错。`0.0.0.0` 让 Windows 主机通过
> WSL2 localhost forwarding 访问到。

### 4. 验证可访问

```bash
# WSL 内
wsl bash -c "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/install.php"
# Windows 主机
curl -s -o NUL -w "%{http_code}" http://localhost:8000/install.php
# 都应该返回 200
```

### 5. 浏览器走安装引导

访问 `http://localhost:8000/install.php`，4 步：

| 步 | 操作 |
|---|---|
| 1 | 欢迎页，点「下一步」 |
| 2 | 选 SQLite，数据库路径 `/mnt/e/deepseek_work/typecho/usr/typecho.db`，表前缀 `typecho_`；填管理员用户名/密码 |
| 3 | 自动生成 `config.inc.php` |
| 4 | 完成，点「进入后台」登录 |

## 关键陷阱（PowerShell + Python + WSL 链路）

### 1. PowerShell ConstrainedLanguage 限制

`pwsh -Command` 模式下：
- ❌ `cmd1 && cmd2`（`&&` 不是合法 statement separator）
- ❌ `cmd1 || cmd2`（`||` 被当 statement separator 解析报错）
- ✅ 用 Python `subprocess.run(['cmd1'], ...)` 然后再 `subprocess.run(['cmd2'], ...)`

### 2. Python f-string 与 bash `$` 冲突

`f"... awk '{print $2}' ..."` 会触发 `f-string: expecting '='` 错误（f-string 把
`$2` 当变量引用）。

**解决**：用普通字符串 + `str.replace('__PLACEHOLDER__', value)`，避免 f-string
也避免 `.format()`（`.format()` 又会把 bash 的 `{print $2}` 当占位符）。

### 3. GBK 控制台渲染

`pwsh` 默认 GBK，commit message / WSL 中文输出大量 `�`，但**实际文件 UTF-8 没问题**。
解析 git 输出用 `encoding='utf-8', errors='replace'`，并在 Python 里
`sys.stdout.reconfigure(encoding='utf-8', errors='replace')`。

### 4. winget 装 XAMPP 慢且需管理员

默认装 300 MB，需管理员权限。可改 winget 装 `PHP.PHP.NTS.8.2` 单独装 PHP（约 30 MB，
多数情况免管理员）。但本场景因走 WSL，本机 PHP 不是必需。

### 5. WSL 默认发行版「Android」谜团

`wsl -l -v` 显示发行版名为「Android」（实际 OS 是 Ubuntu 20.04.6 LTS）。
原因是 winget/PowerShell 把发行版名按 UTF-8 → GBK 转换失败时按字节 fallback 渲染。
**不影响使用**，直接 `wsl bash -c ...` 即可，不必纠结名字。

### 6. Server 进程生命周期

`wsl bash -c "php -S 0.0.0.0:8000"` 在 Windows host 的 pwsh 后台 job 里跑。
host session 结束（关闭 terminal）时进程可能被 SIGTERM。建议：

```bash
# 停止 server
wsl bash -c "pkill -f 'php -S'"
# 或指定 PID
wsl bash -c "kill <PID>"
```

## 沉淀的可复用脚本（`.claude/scripts/`）

| 脚本 | 用途 |
|---|---|
| `_probe_wsl.py` | 探测 WSL 内 PHP/DB/Web server |
| `_probe_win.py` | 探测 Windows 主机 PHP/DB/Web server |
| `_probe_pkgmgr.py` | 探测 Windows 包管理器（winget/choco/scoop） |
| `_start_in_wsl.py` | WSL 一站式：探测 → 装扩展 → 创建目录 → 准备启动 |
| `_verify_server.py` | 启动后 WSL + Windows 双端 curl 验证 |
| `_verify_alive.py` | 日常检查 server 进程是否还在 |
| `_init_skeleton.py` / `_init_check.py` | AI 文档骨架与自检（初始化阶段产物） |

## 关键要点

- **WSL2 localhost forwarding**：Windows 浏览器直接访问 `localhost:PORT` 即可转发到
  WSL 内 `0.0.0.0:PORT`，无需额外端口映射。
- **`php -S` 单进程跑全栈**：PHP 内置 server 监听单端口，可服务静态文件 + 走 PHP 路由，
  适合本地开发，**不适用于生产**。
- **SQLite 文件型数据库**：零配置、零服务，但 WSL 写 `/mnt/e/...` 路径时性能比 ext4 慢
  （Windows 跨 FS 同步），高频写入场景要警惕。
- **探测时显式列举**：grep 缩写容易漏匹配，关键模块要 `^(a|b|c)$` 精确锚定。
- **避开 pwsh 内嵌 bash 复合命令**：所有 `&&` `||` `>` `<` 管道都放 Python subprocess 里。

## 相关

- 项目 CLAUDE.md §4 构建与发版（CI 用的 PHP 7.4/8.0/8.1/8.2 矩阵）
- 项目 `typecho-DEVELOPER_RULES.md` 模块依赖 / 构建系统段
- 全局 `辅助脚本存放位置.md`（hook 脚本 vs 经验脚本 vs 项目脚本）
- 全局 `Python优先规则.md`（ConstrainedLanguage 下的 Python 替代）