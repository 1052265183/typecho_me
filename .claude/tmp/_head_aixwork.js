// AIX-WORK Host half: sync repository MCP servers, skills, and rules.
// 静态 Cordis 包——无外部 import，直接构造 tool 对象。

import { createRequire } from "module";
import { fileURLToPath } from "url";
const _require = createRequire(import.meta.url);
// 内置资源随包发布；同名规则/技能面板配置优先于内置
const _pluginRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const assetsRulesDir = _pluginRoot + "assets/rules";
const assetsSkillsDir = _pluginRoot + "assets/skills";
const assetsPluginsDir = _pluginRoot + "assets/plugins"; // 内置整包技能目录：每个子目录一个技能包（如 mattpocock-skills）

const name = "aix-work";
// ADR-003：加 typert（用于 contexts.use）和 workspaceRegistry
// ADR-004：加 agentPresets（preset authoring 能力）
const inject = ["fs", "subprocess", "timer", "connection", "tools", "systemPrompt", "typert", "workspaceRegistry", "agentPresets", "sessions"];

function apply(ctx) {
  const fs = ctx.fs;
  const subprocess = ctx.subprocess;
  const timer = ctx.timer;
  const connection = ctx.get("connection");
  // 动态获取用户主目录，兼容 Windows（USERPROFILE）和 Linux/Mac（HOME）
  const home = (process.env.USERPROFILE || process.env.HOME || "").replace(/\\/g, "/");
  const dshHome = (process.env.DSH_HOME || (home + "/.dsh"));
  const state = {
    config: {
      basePath: "",
      mcpPaths: [],
      skillPaths: [],
      rulePaths: [],
      pluginCachePaths: [],
      theme: {
        fontFamily: "",
        fontSize: 0,
        codeFontSize: 0,
        lineHeight: 0,
        preset: "",
        dialogWidth: 0,
        tableStyle: "",
        background: { image: "", opacity: 100, blur: 0, brightness: 100 },
        customTheme: {
          applied: false,
          light: { accent: "#4d6bfe", background: "#f7f8fa", foreground: "#262626", contrast: 50 },
          dark: { accent: "#7c91ff", background: "#171719", foreground: "#f3f3f3", contrast: 50 },
        },
      },
    },
    mcpServers: {},
    mcpConnections: {},
    registeredTools: [],
    skills: [],
    rules: [],
    healthStatus: {},
    diagnostics: [],
    rulesMtime: {},
    skillsMtime: {},
    mcpConfigMtime: {},
    openingDocs: [],
    reloadAllDone: false, // reloadAll() 是否已完成
  };
  const toolDisposers = [];
  const skillDisposers = [];

  // 初始化 effect 触发的 reloadAll promise（session/created 需等待其完成）
  let initReloadAllPromise = null;

  // ADR-003 调试日志
  const debugLogPath = (process.env.DSH_HOME || (process.env.USERPROFILE || process.env.HOME || "") + "/.dsh") + "/aix-work-debug.log";
  function debugLog(msg) {
    const line = "[" + new Date().toISOString() + "] " + msg + "\n";
    try { _require("fs").appendFile(debugLogPath, line, function() {}); } catch (e) {}
  }

  function joinPath(base, rel) {
    const b = base.replace(/\\/g, "/");
    const r = rel.replace(/\\/g, "/");
    if (r.includes(":") && r[1] === ":") return r;
    if (r.startsWith("/")) return r;
    const parts = b.split("/").filter(Boolean);
    const relParts = r.split("/").filter(Boolean);
    for (let i = 0; i < relParts.length; i++) {
      if (relParts[i] === "..") parts.pop();
      else if (relParts[i] !== ".") parts.push(relParts[i]);
    }
    let result = parts.join("/");
    if (b.startsWith("/") && !result.startsWith("/")) result = "/" + result;
    return result;
  }

  // 判断文件名是否属于"开场文档"（ADR-002 决策 2）
  // ADR-004 T6：白名单扩展 GAPS*.md / glossary.md（含子目录下的同名文件）
  function isOpeningDoc(name) {
    if (name === "CLAUDE.md" || name === "AGENTS.md" || name === "README.md") return true;
    if (/^ADR-\d+.*\.md$/i.test(name)) return true;
    if (/^GAPS.*\.md$/i.test(name)) return true;
    if (name === "glossary.md" || name === "glossary.en.md") return true;
    return false;
  }

  // 给文档打个 kind 标签，systemPrompt 报告里好读
  function docKind(name) {
    if (name === "CLAUDE.md") return "claude";
    if (name === "AGENTS.md") return "agents";
    if (name === "README.md") return "readme";
    if (/^ADR-/i.test(name)) return "adr";
    if (/^GAPS/i.test(name)) return "gaps";
    if (name === "glossary.md" || name === "glossary.en.md") return "glossary";
    return "other";
  }

  // 递归收集 basePath 下所有项目文档路径及字数，用于开场纪律摘要
  // 不读全文——AI 按需 read，省 token
  // 扫描范围：CLAUDE.md / AGENTS.md / README.md / ADR-*.md / GAPS*.md / glossary.md（ADR-004 T6）
  // 黑名单：node_modules / .git / dist / .claude/planning（ADR-004）
  async function collectDocFiles(basePath, depth, seen) {
    const out = [];
    if (!basePath || depth > 5) return out;
    const norm = basePath.replace(/\\/g, "/").replace(/\/$/, "");
    if (seen.has(norm)) return out;
    seen.add(norm);
    let entries;
    try { entries = await listDir(norm); } catch { return out; }
    for (let i = 0; i < entries.length; i++) {
      const name = entries[i].name;
      const full = joinPath(norm, name);
      if (entries[i].type === "file" && isOpeningDoc(name)) {
        let size = 0;
        try { const info = await fs.stat(await fs.resolve(full)); if (info && info.size) size = info.size; } catch {}
        out.push({ path: full, name: name, size: size, kind: docKind(name) });
      } else if (entries[i].type === "directory") {
        if (name === "node_modules" || name === ".git" || name === "dist") continue;
        // ADR-004：跳过 .claude/planning 子目录
        if (name === "planning" && /\.claude\/?$/.test(norm)) continue;
        const sub = await collectDocFiles(full, depth + 1, seen);
        for (let j = 0; j < sub.length; j++) out.push(sub[j]);
      }
    }
    return out;
  }

  // ADR-004 T6：resolveProjectRoot —— workspaceRegistry.resolveByPath 优先，fallback 到 cwd 原值
  async function resolveProjectRoot(cwd) {
    if (!cwd) return "";
    try {
      // ctxWorkspaceRegistry 访问放到这里，避免顶层访问报错
      let ctxWR = null;
      try { ctxWR = ctx.workspaceRegistry; } catch (e) {}
      if (ctxWR && typeof ctxWR.resolveByPath === "function") {
        const ws = await ctxWR.resolveByPath(cwd);
        if (ws && ws.path) { debugLog("ADR-004 resolveProjectRoot: workspaceRegistry found root=" + ws.path + " for cwd=" + cwd); return ws.path; }
      }
      debugLog("ADR-004 resolveProjectRoot: no owned workspace, fallback to cwd=" + cwd);
      return cwd;
    } catch (e) {
      debugLog("ADR-004 resolveProjectRoot: resolveByPath failed: " + String(e) + ", fallback to cwd=" + cwd);
      return cwd;
    }
  }

  // 构造开场纪律文本：必须在会话开始时读取文档、报告技能/规则数、询问任务
  function buildOpeningPrompt(docListArg, rootClaudeMdArg, isAixWorkArg) {
    const docList = docListArg || [];
    const rootClaudeMd = rootClaudeMdArg || "";
    const isAixWork = isAixWorkArg || false;
    const skillCount = state.skills ? state.skills.length : 0;
    const ruleCount = state.rules ? state.rules.length : 0;
    const mcpTotal = state.mcpServers ? Object.keys(state.mcpServers).length : 0;
    const mcpHealthy = state.healthStatus ? Object.values(state.healthStatus).filter(function(s) { return s && s.status === "green"; }).length : 0;
    let docSummary = "";
    if (docList.length === 0) {
      docSummary = "_(未扫描到 CLAUDE.md / AGENTS.md / README.md / ADR-*.md)_";
    } else {
      docSummary = docList.map(function(d) {
        const tag = d.kind === "claude" ? "[项目指令]" :
                    d.kind === "agents" ? "[代理规范]" :
                    d.kind === "readme" ? "[项目说明]" :
                    d.kind === "adr" ? "[架构决策]" : "[文档]";
        return "- " + tag + " `" + d.path + "` (" + (d.size || 0) + " bytes)";
      }).join("\n");
    }
    let rootClaudeMdSection = "";
    if (isAixWork && rootClaudeMd) {
      rootClaudeMdSection = "\n## 项目根目录 CLAUDE.md 内容（已注入）\n\n" + rootClaudeMd + "\n";
    }
    // 只引用清单不重复全文（防 token 翻倍）；措辞引导模型从已注入的 AGENTS.md 直接引用
    let rulesBody = "";
    if (state.rules && state.rules.length > 0) {
      const names = state.rules.map(function(r) { return (r.name || "").replace(/\.md$/, ""); });
      rulesBody = "\n## Global Rules (全局规则)\n\n" +
        "共 **" + names.length + "** 条，全文已在会话上下文的 workspace instructions（`$DSH_HOME/AGENTS.md`）里完整注入：\n" +
        names.map(function(n) { return "- " + n; }).join("\n") + "\n" +
        "**被问到规则内容/原文时，直接从上下文中已注入的 AGENTS.md 段引用作答，不要用 read/glob 重新读规则文件。**仅当上下文中确实未见该条规则时才 read 原文兜底。\n";
    }
    let openingSection = "";
    if (isAixWork) {
      openingSection = "## Opening Discipline (开场纪律)\n" +
        "会话开始时，你**必须**按以下顺序执行开场动作，**不可省略**：\n" +
        "1. **报告加载摘要**：用一句话向用户报告上述加载摘要（Skills / Rules / MCP / 文档 计数）。\n" +
        "2. **按需读取下方文档**：使用 read 工具按需读取下列文档（不要一次全读）。优先读仓库根 CLAUDE.md / AGENTS.md，再按用户任务读其它：\n" + docSummary + "\n" +
        "3. **加载关键技能**（**首轮必加载，不可推迟**）：调用 skill 工具加载以下两个技能，**作为本会话的第一动作**（在询问用户任务之前）：\n" +
        "   - `grill-with-docs`（relentless interview + 文档生成，**grilling 后续用 ask_user_question 弹窗多轮 Q&A**）\n" +
        "   - `writing-for-agents`（agent 文档写作参考手册）\n" +
        "## Skill Usage Discipline (技能使用纪律 — 硬指令）\n" +
        "下列情况**必须**触发对应技能，**不允许**仅靠模型自觉：\n" +
        "- **If the user's task is unclear**（用户需求模糊、未给出明确目标）→ **must** drive with grill-with-docs' relentless interview loop（**多轮 Q&A 用 `ask_user_question` 弹窗**向用户提问，直到设计树收敛）。弹窗不可用时降级到对话文本 grill（但仍必须 grill，不可跳过）。\n" +
        "- **If you are about to write or edit a document an agent will read**（skill / AGENTS.md / CLAUDE.md / 任何带 pointer 的文档）→ **must** consult writing-for-agents and apply its principles (context pointer / leading word / 信息层级 / pruning)。\n" +
        "## Task Intake (任务询问）\n" +
        "用清晰的中文询问用户本次会话的工作目标。**优先使用 `ask_user_question` 弹窗**提供可选任务方向（点选 + 自定义输入），弹窗不可用时降级为对话文本提问。参考问句：\n" +
        "> 你好，本次会话已加载 **" + skillCount + "** 个技能 / **" + ruleCount + "** 条规则。请告诉我你想做什么？\n" +
        "如果用户需求模糊（回答短、不完整、有歧义），**进入 grill-with-docs 流程**：用 `ask_user_question` 弹窗逐轮精化需求（每轮聚焦一个未明确的维度），直到设计树收敛再开始实施。\n";
    }
    return "# AIX-WORK Repository Context\n\n" +
      "This session has the AIX-WORK plugin active. MCP servers, skills, and rules from the repository are synced into context. MCP tools use prefix mcp_<server>_<tool>. Use the skill tool for synced skills.\n" +
      "## Loading Summary (加载摘要）\n" +
      "- Skills: **" + skillCount + "** 个\n" +
      "- Rules: **" + ruleCount + "** 个\n" +
      "- MCP servers: **" + mcpTotal + "** 个（健康 " + mcpHealthy + " / 异常 " + (mcpTotal - mcpHealthy) + "）\n" +
      "- 项目文档: **" + docList.length + "** 个（路径见下）" + rootClaudeMdSection + "\n" +
      rulesBody +
      openingSection;
  }
  // 比较语义化版本号，返回 1(>), 0(=), -1(<)
  function compareVersion(a, b) {
    const pa = String(a).split(".").map(function(n) { return parseInt(n) || 0; });
    const pb = String(b).split(".").map(function(n) { return parseInt(n) || 0; });
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const va = pa[i] || 0;
      const vb = pb[i] || 0;
      if (va > vb) return 1;
      if (va < vb) return -1;
    }
    return 0;
  }

  async function readJsonFileQuiet(p) {
    try { const t = await fs.resolve(p); return JSON.parse(await fs.readText(t)); } catch { return null; }
  }
  async function readJsonFile(p) {
    try { const t = await fs.resolve(p); return JSON.parse(await fs.readText(t)); } catch (e) { state.diagnostics.push("readJsonFile " + p + ": " + String(e)); return null; }
  }
  async function readTextFile(p) {
    try { const t = await fs.resolve(p); return await fs.readText(t); } catch { return null; }
  }
  async function writeTextFile(p, c) {
    try { const t = await fs.resolve(p); await fs.writeText(t, c); return true; } catch (e) { state.diagnostics.push("writeTextFile " + p + ": " + String(e)); return false; }
  }
  async function listDir(p) {
    try { const t = await fs.resolve(p); return await fs.listDir(t); } catch { return []; }
  }

  // 递归收集目录下所有文件的路径及 mtime（用于变更检测）
  async function collectMtimes(dirPaths, recursive) {
    const result = {};
    for (let d = 0; d < dirPaths.length; d++) {
      let entries;
      try { entries = await listDir(dirPaths[d]); } catch { entries = []; }
      for (let i = 0; i < entries.length; i++) {
        const fullPath = joinPath(dirPaths[d], entries[i].name);
        if (entries[i].type === "file") {
          try { const target = await fs.resolve(fullPath); const info = await fs.stat(target); if (info && info.mtimeMs) result[fullPath] = info.mtimeMs; } catch {}
        } else if (entries[i].type === "directory" && recursive) {
          const sub = await collectMtimes([fullPath], true);
          Object.assign(result, sub);
        }
      }
    }
    return result;
  }

  async function loadConfig() {
    const data = await readJsonFileQuiet(dshHome + "/aix-work-config.json");
    if (data) {
      // 向后兼容：旧 config 只有 repoPath
      if (data.repoPath && !data.basePath) {
        const rp = data.repoPath;
        state.config = {
          basePath: rp + "/.claude",
          mcpPaths: [],
          skillPaths: [],
          rulePaths: [],
          pluginCachePaths: [],
        };
      } else {
        if (data.basePath) state.config.basePath = data.basePath;
        if (Array.isArray(data.mcpPaths)) state.config.mcpPaths = data.mcpPaths;
        if (Array.isArray(data.skillPaths)) state.config.skillPaths = data.skillPaths;
        if (Array.isArray(data.rulePaths)) state.config.rulePaths = data.rulePaths;
        if (Array.isArray(data.pluginCachePaths)) state.config.pluginCachePaths = data.pluginCachePaths;
        if (data.theme && typeof data.theme === "object") {
          var t = data.theme;
          if (typeof t.fontFamily === "string") state.config.theme.fontFamily = t.fontFamily;
          if (typeof t.fontSize === "number") state.config.theme.fontSize = t.fontSize;
          if (typeof t.codeFontSize === "number") state.config.theme.codeFontSize = t.codeFontSize;
          if (typeof t.lineHeight === "number") state.config.theme.lineHeight = t.lineHeight;
          if (typeof t.preset === "string") state.config.theme.preset = t.preset;
          if (typeof t.dialogWidth === "number") state.config.theme.dialogWidth = t.dialogWidth;
          if (typeof t.tableStyle === "string") state.config.theme.tableStyle = t.tableStyle;
          if (t.background && typeof t.background === "object") {
            var bg = t.background;
            if (typeof bg.image === "string") state.config.theme.background.image = bg.image;
            if (typeof bg.opacity === "number") state.config.theme.background.opacity = bg.opacity;
            if (typeof bg.blur === "number") state.config.theme.background.blur = bg.blur;
            if (typeof bg.brightness === "number") state.config.theme.background.brightness = bg.brightness;
          }
          if (t.customTheme && typeof t.customTheme === "object") {
            var ct = t.customTheme;
            if (typeof ct.applied === "boolean") state.config.theme.customTheme.applied = ct.applied;
            if (ct.light) Object.assign(state.config.theme.customTheme.light, ct.light);
            if (ct.dark) Object.assign(state.config.theme.customTheme.dark, ct.dark);
          }
        }
      }
    }
    return state.config;
  }
  // 清理路径值：去掉前后引号和空格
  function cleanPath(p) { if (typeof p !== "string") return p; return p.trim().replace(/^["']+|["']+$/g, "").trim(); }
  function cleanPathArray(arr) { if (!Array.isArray(arr)) return arr; return arr.map(cleanPath).filter(function(p) { return p.length > 0; }); }

  async function saveConfig(newConfig) {
    if (newConfig.basePath !== undefined) state.config.basePath = cleanPath(newConfig.basePath);
    if (Array.isArray(newConfig.mcpPaths)) state.config.mcpPaths = cleanPathArray(newConfig.mcpPaths);
    if (Array.isArray(newConfig.skillPaths)) state.config.skillPaths = cleanPathArray(newConfig.skillPaths);
    if (Array.isArray(newConfig.rulePaths)) state.config.rulePaths = cleanPathArray(newConfig.rulePaths);
    if (Array.isArray(newConfig.pluginCachePaths)) state.config.pluginCachePaths = cleanPathArray(newConfig.pluginCachePaths);
    await writeTextFile(dshHome + "/aix-work-config.json", JSON.stringify(state.config, null, 2));
    await reloadAll();
    return state.config;
  }

  function parseFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return { frontmatter: {}, body: text };
    const fm = {};
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].indexOf(":");
      if (idx > 0) fm[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
    }
    return { frontmatter: fm, body: m[2] };
  }

  function createStdioConnection(serverName, config) {
    return new Promise((resolve, reject) => {
      // Windows 上 .cmd 文件不能被 subprocess.spawn 直接执行（不走 shell），
      // 统一转换为 node + JS 入口的方式启动
      let command = config.command;
      let args = (config.args || []).slice();
      if (process.platform === "win32") {
        // 从 process.execPath 推导 npx-cli.js 路径
        const pathMod = _require("path");
        const nodeDir = pathMod.dirname(process.execPath);
        const npxCliPath = pathMod.join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js");
        if (command === "cmd" && args[0] === "/c") {
          // cmd /c npx -y @pkg → node npx-cli.js @pkg
          args = args.slice(1);
          if (args[0] === "npx") {
            args = args.slice(1);
            if (args[0] === "-y") args = args.slice(1);
            command = process.execPath;
            args = [npxCliPath].concat(args);
          }
        } else if (command === "npx") {
          // npx -y @pkg → node npx-cli.js @pkg
          if (args[0] === "-y") args = args.slice(1);
          command = process.execPath;
          args = [npxCliPath].concat(args);
        } else {
          // 尝试在 npm 全局目录找 JS shim（.cmd 工具如 codegraph 等）
          const npmGlobal = (process.env.APPDATA || pathMod.join(home, "AppData", "Roaming")) + "\\npm\\node_modules";
          const shimPaths = {
            "codegraph": npmGlobal + "\\@colbymchenry\\codegraph\\npm-shim.js",
          };
          if (shimPaths[command]) {
            command = process.execPath;
            args = [shimPaths[config.command]].concat(args);
          }
        }
      }
      const argv = [command].concat(args);
      // 宿主环境为底、配置覆盖：DSH 0.1.2 起 env 只传 config.env 会让 stdio MCP 空环境启动即崩
      const spec = { argv, cwd: state.config.basePath || process.cwd(), stdio: { stdin: "pipe", stdout: "pipe", stderr: "pipe" }, graceMs: 10000, env: Object.assign({}, process.env, config.env || {}) };
      let handle;
      try { handle = subprocess.spawn(spec); } catch (e) { reject(new Error("Spawn failed: " + String(e))); return; }
      if (handle.pid === -1) { reject(new Error("Spawn returned -1 for " + serverName)); return; }
      if (!handle.stdin || !handle.stdout) { reject(new Error("No stdin/stdout for " + serverName)); return; }
      const stdin = handle.stdin;
      const stdout = handle.stdout;
      // stdin 异步 EPIPE 会杀死整个 web 进程，挂处理器只标记断开（30s 超时判失败）
      try { if (stdin && typeof stdin.on === "function") stdin.on("error", function () { if (state.mcpConnections[serverName]) state.mcpConnections[serverName].connected = false; }); } catch {}
      let msgBuffer = "";
      const pending = {};
      let nextId = 1;
      stdout.on("data", (chunk) => {
        msgBuffer += chunk.toString();
        const lines = msgBuffer.split("\n");
        msgBuffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try { const msg = JSON.parse(trimmed); if (msg.id !== undefined && pending[msg.id]) { const cb = pending[msg.id]; delete pending[msg.id]; cb(msg); } } catch {}
        }
      });
      stdout.on("end", () => { if (state.mcpConnections[serverName]) state.mcpConnections[serverName].connected = false; });
      stdout.on("error", () => { if (state.mcpConnections[serverName]) state.mcpConnections[serverName].connected = false; });
      function sendRequest(method, params) {
        return new Promise((res, rej) => {
          const id = nextId++;
          const msg = { jsonrpc: "2.0", id, method };
          if (params) msg.params = params;
          pending[id] = (resp) => { if (resp.error) rej(new Error(JSON.stringify(resp.error))); else res(resp.result); };
          const tDisp = timer.timeout(() => { if (pending[id]) { delete pending[id]; rej(new Error("Timeout: " + method)); } }, 30000);
          try { stdin.write(JSON.stringify(msg) + "\n"); } catch (e) { delete pending[id]; tDisp(); rej(new Error("Write failed: " + String(e))); }
        });
      }
      resolve({ send: sendRequest, close: () => { try { handle.terminate(); } catch {} }, handle, type: "stdio" });
    });
  }

  // 带响应头捕获的 HTTP POST，返回 { body, headers }
  // extraEnv 可选：透传给 curl 子进程，并把 CURL_CA_BUNDLE / NODE_EXTRA_CA_CERTS 转 --cacert，
  // 把 CURL_INSECURE=1 / NODE_TLS_REJECT_UNAUTHORIZED=0 转 -k（兼容 Node 风格 env）
  async function httpPostWithHeaders(url, body, headers, extraEnv) {
    const argv = ["curl", "-s", "-S", "-D", "-", "-X", "POST", "-H", "Content-Type: application/json", "-H", "Accept: application/json, text/event-stream", "-d", JSON.stringify(body), "--max-time", "30"];
    if (headers) for (const k in headers) { argv.push("-H"); argv.push(k + ": " + headers[k]); }
    const env = Object.assign({}, extraEnv || {});
    // CA 证书（curl 风格 + Node 风格都接受）
    const caFile = env.CURL_CA_BUNDLE || env.NODE_EXTRA_CA_CERTS;
    if (caFile) { argv.push("--cacert"); argv.push(caFile); }
    // 跳过 TLS 验证（true 等价物：1/true/yes/on；Node 风格：NODE_TLS_REJECT_UNAUTHORIZED=0 也认）
    const isInsecure = (v) => v === "1" || v === "true" || v === "yes" || v === "on";
    const isRejectOff = (v) => v === "0" || v === "false" || v === "no" || v === "off" || v === "";
    if (isInsecure(env.CURL_INSECURE) || (env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined && isRejectOff(env.NODE_TLS_REJECT_UNAUTHORIZED))) {
      argv.push("-k");
    }
    // 透传给 curl 子进程的标准 env（保留用户其他 env 变量给 curl 用）
    for (const k of ["CURL_CA_BUNDLE", "CURL_INSECURE", "NODE_EXTRA_CA_CERTS", "NODE_TLS_REJECT_UNAUTHORIZED"]) delete env[k];
    argv.push(url);
    const spec = { argv, cwd: state.config.basePath || process.cwd(), stdio: { stdin: "ignore", stdout: { maxBytes: 10485760 }, stderr: { maxBytes: 1048576 } }, graceMs: 10000, env: env };
    try {
      const handle = subprocess.spawn(spec);
      await handle.done;
      let output = "";
      if (handle.collected && handle.collected.stdout) output = handle.collected.stdout.readFrom(0).text;
      // 捕获 curl stderr（用于 TLS/网络错误的诊断信息——之前 SSL 错误消息全丢）
      let stderrText = "";
      if (handle.collected && handle.collected.stderr) stderrText = (handle.collected.stderr.readFrom(0).text || "").trim();
      // 调试日志（保留原格式 + stderr 摘要便于排查 SSL/网络错误）
      const sep0 = output.indexOf("\r\n\r\n");
      const dbgStderr = stderrText ? " | stderr: " + stderrText.substring(0, 120).replace(/\n/g, "\\n") : "";
      console.log("httpPost debug:", url.substring(0, 60), "sep=", sep0, "headerLen=", sep0 >= 0 ? sep0 : 0, "bodyLen=", output.length - (sep0 >= 0 ? sep0 + 4 : 0), dbgStderr);
      // 如果没有 stdout 但有 stderr（典型 SSL/TLS/网络错误），把 stderr 当作错误信息抛
      if (!output && stderrText) throw new Error("curl: " + stderrText.split("\n")[0]);
      // curl -D - 把响应头输出在 body 前面，用 \r\n\r\n 分隔
      const sep = output.indexOf("\r\n\r\n");
      let headerStr = "", bodyStr = output;
      if (sep >= 0) { headerStr = output.substring(0, sep); bodyStr = output.substring(sep + 4); }
      // 如果没有找到 \r\n\r\n，尝试 \n\n
      if (sep < 0) {
        const sep2 = output.indexOf("\n\n");
        if (sep2 >= 0) { headerStr = output.substring(0, sep2); bodyStr = output.substring(sep2 + 2); }
      }
      // 如果 headerStr 里有 HTTP 状态行，说明分隔正确；否则可能整个 output 就是 body（无 -D header）
      if (headerStr.indexOf("HTTP/") < 0) { headerStr = ""; bodyStr = output; }
      // 解析响应头（可能有多个 HTTP 响应，取最后一个）
      const respHeaders = {};
      const headerLines = headerStr.split(/\r?\n/);
      for (let i = 0; i < headerLines.length; i++) {
        const cm = headerLines[i].match(/^([^:]+):\s*(.*)$/);
        if (cm) respHeaders[cm[1].toLowerCase()] = cm[2].trim();
      }
      let rb = bodyStr.trim();
      if (rb.startsWith("event:") || rb.startsWith("data:")) {
        const dl = rb.split("\n").filter((l) => l.startsWith("data:"));
        if (dl.length > 0) rb = dl[dl.length - 1].slice(5).trim();
      }
      // 从 headerStr 提取 HTTP 状态码
      const sm = headerStr.match(/HTTP\/[\d.]+\s+(\d+)/);
      const sc = sm ? parseInt(sm[1]) : 0;
      if (sc >= 200 && sc < 300) {
        try { return { body: JSON.parse(rb), headers: respHeaders }; }
        catch { return { body: { error: "Invalid JSON", body: rb.slice(0, 500) }, headers: respHeaders }; }
      }
      throw new Error("HTTP " + sc + ": " + rb.slice(0, 200));
    } catch (e) { throw new Error("HTTP POST failed: " + String(e)); }
  }

  // 简单包装：只返回 body（兼容旧调用）
  async function httpPost(url, body, headers, extraEnv) {
    const r = await httpPostWithHeaders(url, body, headers, extraEnv);
    return r.body;
  }

  async function connectMcpServer(serverName, config, attempt) {
    attempt = attempt || 1;
    let connection;
    try {
      let tools = [];
      if (config.type === "http") {
        const url = config.url;
        const hdrs = config.headers || {};
        const httpEnv = config.env || {};
        // MCP HTTP transport：initialize 后从响应头提取 Mcp-Session-Id，后续请求带上
        const initResp = await httpPostWithHeaders(url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "aix-work", version: "1.0" } } }, hdrs, httpEnv);
        const sessionId = initResp.headers["mcp-session-id"];
        if (sessionId) hdrs["Mcp-Session-Id"] = sessionId;
        await httpPost(url, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, hdrs, httpEnv);
        const tr = await httpPost(url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, hdrs, httpEnv);
        tools = (tr && tr.result && tr.result.tools) || (tr && tr.tools) || [];
        console.log("MCP " + serverName + ": tools/list returned", tools.length, "tools, respKeys:", tr ? Object.keys(tr).join(",") : "null");
        connection = { type: "http", url, headers: hdrs, connected: true, send: (m, p) => httpPost(url, { jsonrpc: "2.0", id: Date.now(), method: m, params: p || {} }, hdrs, httpEnv), close: () => {} };
      } else {
        connection = await createStdioConnection(serverName, config);
        await connection.send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "aix-work", version: "1.0" } });
        try { connection.handle.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"); } catch {}
        const tResp = await connection.send("tools/list", {});
        tools = (tResp && tResp.tools) || [];
        connection.connected = true;
      }
      state.mcpConnections[serverName] = { connected: true, type: config.type || "stdio", tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), error: null, attempts: attempt, close: connection.close };
      for (let i = 0; i < tools.length; i++) registerMcpTool("mcp_" + serverName.replace(/[^a-zA-Z0-9]/g, "_") + "_" + tools[i].name, serverName, tools[i], connection);
      console.log("MCP connected:", serverName, tools.length, "tools");
      return connection;
    } catch (e) {
      // 连接失败时清理已建立的 stdio 子进程，避免泄漏
      if (connection && connection.close) { try { connection.close(); } catch {} }
      if (attempt < 3) { await new Promise((r) => timer.timeout(r, 2000 * attempt)); return connectMcpServer(serverName, config, attempt + 1); }
      state.mcpConnections[serverName] = { connected: false, type: config.type || "stdio", tools: [], error: String(e), attempts: attempt };
      throw e;
    }
  }

  // 内联 makeTool：替代 defineTool，直接构造 ctx.tools.register() 所需的对象
  function makeTool(opts) {
    return {
      name: opts.name,
      description: opts.description,
      parameters: opts.parameters || { type: "object", properties: {} },
      output: {
        schema: opts.output?.schema || { type: "object", properties: { result: { type: "string" } } },
        render: opts.output?.render || ((a, v) => [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }])
      },
      execute: opts.execute
    };
  }

  function registerMcpTool(toolName, serverName, mcpTool, connection) {
    try {
      const toolDef = makeTool({
        name: toolName,
        description: mcpTool.description || ("MCP tool " + toolName + " from " + serverName),
        parameters: mcpTool.inputSchema || { type: "object", properties: {} },
        execute: async (args) => {
          try {
            const result = await connection.send("tools/call", { name: mcpTool.name, arguments: args });
            let text = "";
            if (result && result.content) { for (let i = 0; i < result.content.length; i++) { if (result.content[i].type === "text") text += result.content[i].text; else text += JSON.stringify(result.content[i]); } }
            else text = JSON.stringify(result);
            return { result: text };
          } catch (e) { return { result: "Error: " + String(e) }; }
        }
      });
      const d = ctx.tools.register(toolDef);
      toolDisposers.push(d);
      state.registeredTools.push({ name: toolName, server: serverName, mcpName: mcpTool.name });
    } catch (e) { console.log("Register tool failed:", toolName, String(e)); }
  }

  async function loadMcpServers() {
    // 遍历 mcpPaths 数组，合并所有 JSON 文件中的 mcpServers（后者覆盖前者同名 server）
    state.mcpServers = {};
    const paths = state.config.mcpPaths || [];
    if (paths.length === 0) { state.diagnostics.push("No mcpPaths configured"); return state.mcpServers; }
    for (let i = 0; i < paths.length; i++) {
      const data = await readJsonFile(paths[i]);
      if (data && data.mcpServers) {
        for (const name in data.mcpServers) state.mcpServers[name] = data.mcpServers[name];
        console.log("MCP config loaded from:", paths[i], Object.keys(data.mcpServers).length, "servers");
      } else {
        state.diagnostics.push("No mcpServers in: " + paths[i]);
      }
    }
    // 记录 mcp 配置文件 mtime 快照（用于变更检测）
    state.mcpConfigMtime = {};
    for (let i = 0; i < paths.length; i++) {
      try { const target = await fs.resolve(paths[i]); const info = await fs.stat(target); if (info && info.mtimeMs) state.mcpConfigMtime[paths[i]] = info.mtimeMs; } catch {}
    }
    return state.mcpServers;
  }
  async function connectAllMcpServers() {
    const names = Object.keys(state.mcpServers);
    for (let i = 0; i < names.length; i++) {
      const nm = names[i];
      const config = state.mcpServers[nm];
      if (config.command === "node" && config.args && config.args[0] && String(config.args[0]).includes("/opt/")) {
        state.mcpConnections[nm] = { connected: false, type: config.type || "stdio", tools: [], error: "Path not available" }; continue;
      }
      try { await connectMcpServer(nm, config); } catch {}
    }
  }

  async function scanSkills() {
    // 同名去重：[内置 assets] → [skillPaths] → [pluginCachePaths]，后者覆盖前者
    const skillMap = {};
    const skillOrder = [];
    const collect = async (dirPath) => {
      await checkSkillDirCollect(dirPath, skillMap, skillOrder);
    };
    const skillPaths = [assetsSkillsDir, assetsPluginsDir].concat(state.config.skillPaths || []);
    for (let p = 0; p < skillPaths.length; p++) {
      let entries; try { entries = await listDir(skillPaths[p]); } catch (e) { entries = []; }
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].type === "directory") await collect(joinPath(skillPaths[p], entries[i].name));
      }
    }
    const cachePaths = state.config.pluginCachePaths || [];
    for (let c = 0; c < cachePaths.length; c++) {
      const entries = await listDir(cachePaths[c]);
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].type === "directory") await collect(joinPath(cachePaths[c], entries[i].name));
      }
    }
    state.skills = [];
    for (let k = 0; k < skillOrder.length; k++) {
      const s = skillMap[skillOrder[k]];
      state.skills.push(s);
      registerSkill(s);
    }
    // 记录 skills 源文件 mtime 快照（用于变更检测，覆盖内置目录）
    const allSkillDirs = [assetsSkillsDir, assetsPluginsDir].concat(state.config.skillPaths || []).concat(state.config.pluginCachePaths || []);
    const allMtimes = await collectMtimes(allSkillDirs, true);
    state.skillsMtime = {};
    for (const p in allMtimes) { if (p.endsWith("SKILL.md")) state.skillsMtime[p] = allMtimes[p]; }
    return state.skills.map((s) => ({ name: s.name, description: s.description, path: s.path }));
  }
  async function checkSkillDirCollect(dirPath, skillMap, skillOrder) {
    const skillPath = joinPath(dirPath, "SKILL.md");
    const content = await readTextFile(skillPath);
    if (content) {
      const p = parseFrontmatter(content);
      const fm = p.frontmatter;
      const nm = fm.name || dirPath.split("/").pop().split("\\").pop();
      if (nm === "deprecated" || dirPath.includes("/deprecated/") || dirPath.includes("\\deprecated\\")) return;
      const item = { name: nm, description: fm.description || "", whenToUse: fm.whenToUse || "", content: p.body, path: skillPath, metadata: fm };
      if (skillMap[nm]) {
        // 同名覆盖：替换内容但保持原有顺序位置
        skillMap[nm] = item;
      } else {
        skillMap[nm] = item;
        skillOrder.push(nm);
      }
    } else {
      const subDirs = await listDir(dirPath);
      for (let i = 0; i < subDirs.length; i++) {
        if (subDirs[i].type === "directory") await checkSkillDirCollect(joinPath(dirPath, subDirs[i].name), skillMap, skillOrder);
      }
    }
  }
  function registerSkill(skill) {
    try {
      const skills = ctx.get("skills");
      if (!skills) return;
      const d = skills.register({ name: skill.name, description: skill.description, whenToUse: skill.whenToUse || undefined, content: skill.content, path: skill.path, metadata: skill.metadata, source: "aix-work" });
      skillDisposers.push(d);
    } catch (e) { console.log("Skill register failed:", skill.name, String(e)); debugLog("Skill register FAILED: " + skill.name + ": " + String(e)); }
  }

  async function syncRules() {
    state.rules = [];
    // 同名规则按文件名去重，面板配置覆盖内置
    const rulePaths = [assetsRulesDir].concat(state.config.rulePaths || []);
    const scannedPaths = [];
    // 规则全文写 AGENTS.md（DSH core 注入兜底），sp 层只引用清单（见 ADR-005）
    const ruleMap = {};
    const ruleOrder = [];
    for (let r = 0; r < rulePaths.length; r++) {
      const rd = rulePaths[r];
      scannedPaths.push(rd);
      let entries;
      try { entries = await listDir(rd); } catch (e) { entries = []; }
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].type === "file" && entries[i].name.endsWith(".md")) {
          const key = entries[i].name.replace(/\.md$/, "");
          const c = await readTextFile(joinPath(rd, entries[i].name));
          if (c) {
            // 多路径规则按文件名去重：配置数组顺序 = 优先级，后面的覆盖前面的
            if (!ruleMap[key]) ruleOrder.push(key);
            ruleMap[key] = { name: entries[i].name, path: joinPath(rd, entries[i].name), content: c };
          }
        }
      }
    }
    for (let k = 0; k < ruleOrder.length; k++) state.rules.push(ruleMap[ruleOrder[k]]);
    // 清单 + 原文使用指令 + 开场播报 + 规则全文
    const manifestLines = [];
    manifestLines.push("## 本模式内置规则（" + state.rules.length + " 条）\n");
    for (let a = 0; a < state.rules.length; a++) manifestLines.push("- " + state.rules[a].name.replace(/\.md$/, ""));
    manifestLines.push("\n## 规则原文使用指令（强制）\n");
    manifestLines.push("本文件下方各规则的全文**就是规则原文**（唯一权威来源，已随本文件注入会话上下文）。当用户询问内置规则、规则数量、或某条规则的内容/原文时，**直接依据本文件内容作答，禁止先用 read/glob 等工具去读规则源文件**。仅当本文件中确实找不到该条规则时，才用 read 读取上方 Rules from 列出的源目录中的同名 .md 兜底。\n");
    manifestLines.push("\n## 开场播报（强制）\n");
    manifestLines.push("每次会话的第一条回复，先用一句话向用户简要说明本模式已自动生效（内置 " + state.rules.length + " 条规则与 " + (state.skills || []).length + " 个技能，无需逐条列出，需要时我会直接使用），随后立即询问或处理用户的具体请求。禁止在开场逐条罗列规则或技能名称。\n");
    const manifest = manifestLines.join("\n");
    const all = [];
    for (let k2 = 0; k2 < state.rules.length; k2++) {
      all.push("## " + state.rules[k2].name.replace(/\.md$/, "") + "\n\n" + state.rules[k2].content);
    }
    const merged = "# AGENTS.md - Auto-synced Rules\n\n> Auto-generated by AIX-WORK. Rules from " + scannedPaths.join(", ") + "\n\n" + manifest + "\n\n---\n\n" + all.join("\n\n---\n\n");
    // 首次接管保护：已存在非 AIX-WORK 生成的 AGENTS.md 时先备份，避免覆盖用户自有内容
    try {
      const _existingAgents = await readTextFile(dshHome + "/AGENTS.md");
      if (_existingAgents && _existingAgents.indexOf("Auto-generated by AIX-WORK") === -1) {
        const _bak = await readTextFile(dshHome + "/AGENTS.md.aixwork.bak");
        if (!_bak) await writeTextFile(dshHome + "/AGENTS.md.aixwork.bak", _existingAgents);
      }
    } catch (eBak) {}
    await writeTextFile(dshHome + "/AGENTS.md", merged);
    state.rulesMtime = await collectMtimes([assetsRulesDir].concat(state.config.rulePaths || []), false);
    console.log("Rules synced:", state.rules.length, "rules (AGENTS.md written: " + (merged.length / 1024).toFixed(1) + "KB; sp.section 引用清单)");
    debugLog("syncRules: " + state.rules.length + " rules, AGENTS.md " + (merged.length / 1024).toFixed(1) + "KB, sources: " + scannedPaths.join(" + "));
    return state.rules.map((r) => ({ name: r.name, path: r.path }));
  }

  async function runHealthCheck() {
    const names = Object.keys(state.mcpServers);
    const devnull = process.platform === "win32" ? "NUL" : "/dev/null";
    for (let i = 0; i < names.length; i++) {
      const nm = names[i];
      const config = state.mcpServers[nm];
      const conn = state.mcpConnections[nm];
      if (conn && conn.connected) {
        // 已连接直接判绿：裸探测对 streamable-HTTP 无意义
        state.healthStatus[nm] = { status: "green", httpStatus: null, error: null };
      } else if (config.type === "http" && config.url) {
        try {
          // initialize 请求体 + SSE Accept：任何 HTTP 状态码都算可达
          const initBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "aix-work-health", version: "1.0.0" } } });
          const argv = ["curl", "-s", "-o", devnull, "-w", "%{http_code}", "--max-time", "8", "-H", "Accept: application/json, text/event-stream"];
          if (config.headers) for (const k in config.headers) { argv.push("-H", k + ": " + config.headers[k]); }
          argv.push("-X", "POST", "-H", "Content-Type: application/json", "-d", initBody);
          argv.push(config.url);
          const spec = { argv, cwd: state.config.basePath || process.cwd(), stdio: { stdin: "ignore", stdout: { maxBytes: 100 }, stderr: { maxBytes: 100 } }, graceMs: 12000 };
          const handle = subprocess.spawn(spec);
          await handle.done;
          let code = "";
          if (handle.collected && handle.collected.stdout) code = handle.collected.stdout.readFrom(0).text.trim();
          const cn = parseInt(code) || 0;
          // 401/403 也算"可达"（server 响应了，只是认证问题），只有 0 才是 No response
          state.healthStatus[nm] = { status: cn > 0 ? "green" : "red", httpStatus: cn, error: cn === 0 ? "No response" : null };
        } catch (e) { state.healthStatus[nm] = { status: "red", httpStatus: 0, error: String(e) }; }
      } else { state.healthStatus[nm] = { status: "grey", httpStatus: null, error: null }; }
    }
    return state.healthStatus;
  }

  async function reloadAll() {
    for (let i = 0; i < toolDisposers.length; i++) { try { toolDisposers[i](); } catch {} }
    toolDisposers.length = 0;
    state.registeredTools = [];
    for (let j = 0; j < skillDisposers.length; j++) { try { skillDisposers[j](); } catch {} }
    skillDisposers.length = 0;
    for (const nm in state.mcpConnections) { if (state.mcpConnections[nm] && state.mcpConnections[nm].close) { try { state.mcpConnections[nm].close(); } catch {} } }
    state.mcpConnections = {};
    state.healthStatus = {};
    state.diagnostics = [];
    await loadConfig();
    debugLog("reloadAll: config loaded, basePath=" + (state.config.basePath || "(empty)"));
    await loadMcpServers();
    debugLog("reloadAll: mcp config loaded, " + Object.keys(state.mcpServers).length + " servers");
    await connectAllMcpServers();
    {
      const names = Object.keys(state.mcpServers);
      const okNames = names.filter(function(n) { return state.mcpConnections[n] && state.mcpConnections[n].connected; });
      const failNames = names.filter(function(n) { return !okNames.includes(n); });
      debugLog("reloadAll: mcp connected " + okNames.length + "/" + names.length + (failNames.length ? ", failed: " + failNames.join(", ") : ""));
    }
    await scanSkills();
    debugLog("reloadAll: skills scanned " + state.skills.length + " (dedup merged)");
    await syncRules();
    debugLog("reloadAll: rules synced " + state.rules.length + ", AGENTS.md " + ((state.rules.length) ? "written" : "empty"));
    await runHealthCheck();
    {
      const hs = state.healthStatus;
      const green = Object.keys(hs).filter(function(n) { return hs[n] && hs[n].status === "green"; }).length;
      debugLog("reloadAll: health check done, green " + green + "/" + Object.keys(hs).length);
    }
    // preset ensure：自动创建/自愈（persona + maxBytes 262144 + ptc 底座跟随）
    try {
      const r = await ensureAixworkPreset(true);
      if (r && r.created) { console.log("AIX-WORK preset 已创建"); debugLog("reloadAll: aix-work preset created"); }
      else if (r && r.updated) { console.log("AIX-WORK preset 已自愈（persona/maxBytes）"); debugLog("reloadAll: aix-work preset updated (persona/maxBytes)"); }
      else debugLog("reloadAll: aix-work preset ok (no change)");
    } catch (e) { console.log("AIX-WORK preset ensure failed:", String(e)); debugLog("reloadAll: aix-work preset ensure FAILED: " + String(e)); }
    try {
      const rPtc = await ensureAixworkPtc(true);
      if (rPtc && rPtc.created) { console.log("AIX-WORK ptc preset 已创建（AIX-WORK-PTC）"); debugLog("reloadAll: aix-work-ptc preset created"); }
      else if (rPtc && rPtc.updated) { console.log("AIX-WORK ptc preset 底座已自愈"); debugLog("reloadAll: aix-work-ptc preset updated (base follow)"); }
      else debugLog("reloadAll: aix-work-ptc preset ok (no change)");
    } catch (e) { console.log("AIX-WORK ptc preset ensure failed:", String(e)); debugLog("reloadAll: aix-work-ptc preset ensure FAILED: " + String(e)); }
    // 开场文档扫描（ADR-003/ADR-004）：reloadAll 后更新 openingDocs 供 buildOpeningPrompt 使用
    try {
      const seen = new Set();
      state.openingDocs = await collectDocFiles(state.config.basePath || "", 0, seen);
      debugLog("Opening docs scanned: " + state.openingDocs.length + " from " + (state.config.basePath || "(empty)"));
    } catch (e) {
      state.openingDocs = [];
      state.diagnostics.push("collectDocFiles: " + String(e));
    }
    state.reloadAllDone = true;
  }

  // session/created 事件注册（ADR-003/ADR-004 懒触发）
  // typert.contexts.getHost('agent').resolve(sid) → agent 的 ctx（含 per-agent sp）
  let ctxTypert = null;
  try { ctxTypert = ctx.typert; } catch (e) { debugLog("ADR-003 ctx.typert access failed: " + String(e)); }
  const hasAgentContext = !!ctxTypert && !!ctxTypert.contexts && typeof ctxTypert.contexts.getHost === "function";
  debugLog("ADR-003 init: typert=" + (ctxTypert ? "YES" : "NO") + ", hasContexts=" + (ctxTypert && ctxTypert.contexts ? "YES" : "NO") + ", hasAgentContext=" + hasAgentContext);

  // 全局 sp：session/created 回调在同步注册时需要此引用
  const sp = ctx.get("systemPrompt");

  // ADR-004 T4：session/created 监听器——所有会话都注册，用 session.cwd 扫描
  // hasAgentContext 时在 agent scope 注册 sp，否则用全局 sp（后者在 dsh-dev 中是唯一可用路径）
  const sessionSectionRefs = new Map(); // sessionId → disposer
  try {
    ctx.on("session/created", function(session) {
      if (!session || !session.id) return;
      const sid = session.id;
      const cwd = (session.header && session.header.cwd) || state.config.basePath || "";
      // header.agentPreset 是创建时冻结值；composedPreset() 是当前真实 preset（含动态选择）
      // 必须等 reloadAll 完成 + 拿到 agentCtx 后再读 composedPreset()
      (async function() {
        // 等 init effect 的 reloadAll 完成（避免 state.skills/rules 仍为空）
        if (!state.reloadAllDone && initReloadAllPromise) {
          await initReloadAllPromise;
        }
        // 获取 agent context（typert 解析），同时确定 isAixWork 和 theSp
        let theSp = sp;
        let isAixWork = false;
        let agentCtx = null;
        if (hasAgentContext) {
          try {
            const adapter = ctxTypert.contexts.getHost("agent");
            if (adapter) {
              agentCtx = await adapter.resolve(sid);
              if (agentCtx) {
                // 读取当前真实 preset（header.agentPreset 是创建时冻结值，不准）
                try {
                  const composed = ctx.get("agentPresets") && ctx.agentPresets.composedPreset
                    ? ctx.agentPresets.composedPreset(agentCtx)
                    : undefined;
                  isAixWork = composed === "aix-work" || composed === "aix-work-ptc";
                  debugLog("session/created: sid=" + sid + ", composedPreset=" + JSON.stringify(composed) + ", isAixWork=" + isAixWork);
                } catch (e) { debugLog("composedPreset failed: " + String(e)); }
                const agentSp = agentCtx.get("systemPrompt");
                if (agentSp) {
                  theSp = agentSp;
                  debugLog("Using per-agent sp for sid=" + sid);
                } else {
                  debugLog("agentCtx found but no systemPrompt for sid=" + sid);
                }
              } else {
                debugLog("agent context resolve returned null for sid=" + sid);
              }
            } else {
              debugLog("agent host adapter not registered");
            }
          } catch (e) { debugLog("agent context resolve failed: " + String(e)); }
        }
        // 没有 agentCtx 时回退到 header.agentPreset
        if (!agentCtx) {
          const headerPreset = session.header && session.header.agentPreset;
          isAixWork = headerPreset === "aix-work" || headerPreset === "aix-work-ptc";
          debugLog("session/created (fallback header): sid=" + sid + ", headerPreset=" + JSON.stringify(headerPreset) + ", isAixWork=" + isAixWork);
        }
        if (!theSp) { debugLog("no systemPrompt for " + sid); return; }

        // 统一从 session.cwd 扫描注册（所有会话，Skills/Rules/MCP 对所有模式生效）
        // CLAUDE.md 内容仅对 AIX-WORK 模式注入
        try {
          const seen = new Set();
          const docs = cwd ? await collectDocFiles(cwd, 0, seen) : [];
          // 仅 AIX-WORK 模式读取根目录 CLAUDE.md 内容注入上下文
          let rootClaudeMd = "";
          if (isAixWork) {
            try {
              const claudePath = cwd.replace(/\\/g, "/").replace(/\/$/, "") + "/CLAUDE.md";
              const content = await readTextFile(claudePath);
              if (content) {
                rootClaudeMd = content.substring(0, 8000);
                debugLog("Root CLAUDE.md read: " + rootClaudeMd.length + " chars from " + claudePath);
              }
            } catch (e) { debugLog("read root CLAUDE.md failed: " + String(e)); }
          }
          const old = sessionSectionRefs.get(sid);
          if (old) { try { old(); } catch {} }
          const disp = theSp.section({ name: "aix-work-context", order: 50, text: buildOpeningPrompt(docs, rootClaudeMd, isAixWork) });
          sessionSectionRefs.set(sid, disp);
          debugLog("Section registered for " + sid + ": " + docs.length + " docs from " + cwd + (isAixWork ? " (AIX-WORK mode, CLAUDE.md injected)" : " (standard mode)"));
        } catch (e) { debugLog("session/created scan failed: " + String(e)); }
      })();
    });
  } catch (e) { debugLog("ctx.on session/created failed: " + String(e)); }
  try {
    ctx.on("session/disposed", function(session) {
      if (!session || !session.id) return;
      const old = sessionSectionRefs.get(session.id);
      if (old) { try { old(); } catch {} sessionSectionRefs.delete(session.id); }
    });
  } catch (e) { debugLog("ctx.on session/disposed failed: " + String(e)); }
  // 监听 agent-preset/selected：用户切换 preset 后，重新注册对应 session 的 section
  try {
    ctx.on("agent-preset/selected", function(sessionId, newPreset) {
      if (!sessionId) return;
      const sid = String(sessionId);
      debugLog("agent-preset/selected: sid=" + sid + ", newPreset=" + JSON.stringify(newPreset));
      // 旧的 section 作废（dispose）
      const old = sessionSectionRefs.get(sid);
      if (old) { try { old(); } catch {} sessionSectionRefs.delete(sid); }
      // 异步重新注册（用新的 preset）
      (async function() {
        if (!state.reloadAllDone && initReloadAllPromise) {
          await initReloadAllPromise;
        }
        let theSp = sp;
        let isAixWork = newPreset === "aix-work" || newPreset === "aix-work-ptc";
        let cwd = "";
        // 从 ctx.sessions 取 cwd（最权威）
        try {
          const sessionsSvc = ctx.sessions;
          if (sessionsSvc && typeof sessionsSvc.get === "function") {
            const sess = sessionsSvc.get(sid);
            if (sess && sess.header && sess.header.cwd) cwd = sess.header.cwd;
          }
        } catch (e) { debugLog("agent-preset/selected: sessions.get failed: " + String(e)); }
        if (hasAgentContext && ctxTypert && ctxTypert.contexts && ctxTypert.contexts.getHost) {
          try {
            const adapter = ctxTypert.contexts.getHost("agent");
            if (adapter) {
              const agentCtx = await adapter.resolve(sid);
              if (agentCtx) {
                // 重新读取 composedPreset（最权威）
                try {
                  const composed = ctx.get("agentPresets") && ctx.agentPresets.composedPreset
                    ? ctx.agentPresets.composedPreset(agentCtx)
                    : undefined;
                  if (composed) isAixWork = composed === "aix-work" || composed === "aix-work-ptc";
                } catch (e) {}
                const agentSp = agentCtx.get("systemPrompt");
                if (agentSp) theSp = agentSp;
              }
            }
          } catch (e) { debugLog("agent-preset/selected: resolve failed: " + String(e)); }
        }
        if (!cwd) cwd = state.config.basePath || "";
        if (!theSp) return;
        try {
          const seen = new Set();
          const docs = cwd ? await collectDocFiles(cwd, 0, seen) : [];
          let rootClaudeMd = "";
          if (isAixWork) {
            try {
              const claudePath = cwd.replace(/\\/g, "/").replace(/\/$/, "") + "/CLAUDE.md";
              const content = await readTextFile(claudePath);
              if (content) rootClaudeMd = content.substring(0, 8000);
            } catch (e) {}
          }
          const disp = theSp.section({ name: "aix-work-context", order: 50, text: buildOpeningPrompt(docs, rootClaudeMd, isAixWork) });
          sessionSectionRefs.set(sid, disp);
          debugLog("Section re-registered for " + sid + " (preset=" + newPreset + ", isAixWork=" + isAixWork + ")");
        } catch (e) { debugLog("agent-preset/selected re-register failed: " + String(e)); }
      })();
    });
  } catch (e) { debugLog("ctx.on agent-preset/selected failed: " + String(e)); }
  debugLog("ADR-004: session/created listener registered" + (hasAgentContext ? " (agent context available)" : " (global sp)"));

  // ADR-004 T5：agent/pre-step 懒触发（暂时禁用，dsh-dev 中 ctx.on 干扰事件系统）
  // const pendingFirstTurn = new Set();
  // try {
  //   ctx.on("agent/pre-step", function(evt) {
  //     let sid = null;
  //     if (evt && typeof evt === "object") {
  //       if (typeof evt.sid === "string") sid = evt.sid;
  //       else if (evt.session && typeof evt.session.id === "string") sid = evt.session.id;
  //       else if (evt.agent && typeof evt.agent.sessionId === "string") sid = evt.agent.sessionId;
  //     }
  //     if (!sid || !pendingFirstTurn.has(sid)) return;
  //     pendingFirstTurn.delete(sid);
  //     debugLog("agent/pre-step lazy trigger for " + sid);
  //     (async function() {
  //       try {
  //         const session = evt && evt.session ? evt.session : null;
  //         const cwd = (session && session.header && session.header.cwd) || state.config.basePath || "";
  //         const projectRoot = await resolveProjectRoot(cwd);
  //         const seen = new Set();
  //         const docs = await collectDocFiles(projectRoot, 0, seen);
  //         const agentCtx = await ctxTypert.contexts.use("agent", sid);
  //         if (!agentCtx) { debugLog("agent/pre-step: agentCtx unavailable for " + sid); return; }
  //         const agentSp = agentCtx.get("systemPrompt");
  //         if (!agentSp) { debugLog("agent/pre-step: no systemPrompt for " + sid); return; }
  //         const old = sessionSectionRefs.get(sid);
  //         if (old) { try { old(); } catch {} sessionSectionRefs.delete(sid); }
  //         const disp = agentSp.section({ name: "aix-work-context", order: 50, text: buildOpeningPrompt(docs) });
  //         sessionSectionRefs.set(sid, disp);
  //         debugLog("agent/pre-step: replaced section for " + sid + " with " + docs.length + " docs from " + projectRoot);
  //       } catch (e) { debugLog("agent/pre-step lazy trigger failed for " + sid + ": " + String(e)); }
  //     })();
  //   });
  //   debugLog("ADR-004: agent/pre-step lazy-trigger listener registered");
  // } catch (e) { debugLog("ctx.on agent/pre-step failed: " + String(e)); }

  // system prompt section 已移到初始化 effect（loadConfig+reloadAll 之后注册）

  // RPC handlers — 通过 connection.rpc.handle 注册，所有 endpoint 通过 /aixwork channel 分发
  const handlers = {};
  handlers["checkPreset"] = async () => {
    try {
      const ap = ctx.get("agentPresets");
      if (!ap) return { exists: false, error: "agentPresets service unavailable" };
      const list = await ap.list();
      for (let i = 0; i < list.length; i++) { if (list[i].id === "aix-work") return { exists: true, path: list[i].path }; }
      return { exists: false };
    } catch (e) { return { exists: false, error: String(e) }; }
  };
  // AIX-WORK 开场协议 persona 块（幂等：含标记串则跳过）
  const AIXWORK_PRESET_MARKER = "AIX-WORK 模式开场协议";
  const AIXWORK_PERSONA_BLOCK = [
    "- id: persona",
    "  name: '@deepseek-ai/dsh-persona'",
    "  config:",
    "    prefix: |",
    "      你是 AIX-WORK 模式的编码代理，由 {{model}} 模型驱动，工作目录是 {{cwd}}。全程使用中文输出。",
    "",
    "      ## " + AIXWORK_PRESET_MARKER + "（每次会话的第一条回复必须先完成，再处理用户请求）",
    "      1. 一句话开场：向用户简要说明本模式已自动生效（内置规则与技能无需逐条列出，需要时直接使用），禁止罗列清单。",
    "      2. 读取项目上下文：用 read 工具读取当前工作目录的 CLAUDE.md；若存在，按其文档索引继续读取关键关联文档（README.md、.claude/planning/glossary.md 等）；若不存在，向用户说明当前目录没有 CLAUDE.md。",
    "      3. 加载工作技能：用 skill 工具加载 grill-with-docs 与 writing-for-agents 两个技能，后续需求访谈与文档沉淀按这两个技能执行。",
    "      4. 询问任务：完成上述动作后，询问用户本次要做什么任务（开放式提问或用 ask_user_question 给出候选方向）。",
    "",
    "      ## 核心规则",
    "      遵守本模式内置的全部规则（见 AGENTS.md 清单），特别是：全部使用中文输出、禁止自动提交 Git、Python 优先、分析问题禁止瞎猜。若与项目 CLAUDE.md 冲突，项目 CLAUDE.md 优先。",
    "",
  ].join("\n");

  // 定位 preset 副本的 agent.cordis.yml（entry.path 形态不确定，多候选探测 + dshHome 兜底）
  async function resolvePresetYml(entry, presetId) {
    const candidates = [];
    if (entry && entry.path) {
      const p1 = entry.path.replace(/\\/g, "/").replace(/\/$/, "");
      if (p1.endsWith("/agent.cordis.yml")) candidates.push(p1);
      candidates.push(p1 + "/agent.cordis.yml");
      candidates.push(p1.replace(/\/[^/]+$/, "") + "/" + presetId + "/agent.cordis.yml");
    }
    candidates.push(dshHome.replace(/\\/g, "/") + "/.agent-presets/" + presetId + "/agent.cordis.yml");
    for (let c = 0; c < candidates.length; c++) {
      const t = await readTextFile(candidates[c]);
      if (t && t.indexOf("agent-instructions") >= 0) return { ymlPath: candidates[c], yml: t };
    }
    return null;
  }

  // AIX-WORK 变换（幂等）：persona 块替换 + maxBytes 262144（默认 64KB 会整段砍 AGENTS.md）
  async function applyAixworkTransform(ymlPath, yml) {
    let out = yml;
    let hasMarker = out.indexOf(AIXWORK_PRESET_MARKER) >= 0;
    // v1 旧文案检测，需整体重注入
    const hasOldPersona = out.indexOf("播报内置能力") >= 0 || out.indexOf("先用一小节向用户简要播报") >= 0;
    if (!hasMarker || (hasMarker && hasOldPersona)) {
      // persona 块整体替换（- id: persona 行到 - id: agent-instructions 行之前）
      const lines = out.split(/\r?\n/);
      const pi = lines.findIndex((l) => l.replace(/\r$/, "").indexOf("- id: persona") === 0);
      const ai = lines.findIndex((l) => l.replace(/\r$/, "").indexOf("- id: agent-instructions") === 0);
      if (pi < 0 || ai < 0 || ai <= pi) throw new Error("preset 文件缺少 persona/agent-instructions 锚点");
      const newBlock = AIXWORK_PERSONA_BLOCK.replace(/\n$/, "").split("\n");
      out = lines.slice(0, pi).concat(newBlock, lines.slice(ai)).join("\n");
      hasMarker = true;
    }
    if (out.indexOf("maxBytes: 65536") >= 0) out = out.replace(/maxBytes: 65536/g, "maxBytes: 262144");
    if (out !== yml) {
      await writeTextFile(ymlPath, out);
      console.log("AIX-WORK preset 已更新（开场协议/maxBytes 262144）:", ymlPath);
      return { path: ymlPath, yml: out, updated: true };
    }
    return { path: ymlPath, yml: out, updated: false };
  }

  // aix-work 主 preset ensure：不存在则 copy + 变换；存在则幂等自愈
  async function ensureAixworkPreset(autoCreate) {
    const ap = ctx.get("agentPresets");
    if (!ap) throw new Error("agentPresets service unavailable");
    const list = await ap.list();
    let entry = null;
    for (let i = 0; i < list.length; i++) { if (list[i].id === "aix-work") entry = list[i]; }
    if (!entry) {
      if (!autoCreate) return { exists: false };
      await ap.copy("standard", "aix-work", "AIX-WORK");
      const list2 = await ap.list();
      for (let i = 0; i < list2.length; i++) { if (list2[i].id === "aix-work") entry = list2[i]; }
    }
    const r = await resolvePresetYml(entry, "aix-work");
    if (!r) throw new Error("找不到 aix-work preset 的 agent.cordis.yml");
    const t = await applyAixworkTransform(r.ymlPath, r.yml);
    return { exists: true, created: !entry, updated: t.updated, path: t.path };
  }
  handlers["checkPresetPTC"] = async () => {
    try {
      const ap = ctx.get("agentPresets");
      if (!ap) return { exists: false, error: "agentPresets service unavailable" };
      const list = await ap.list();
      let entry = null;
      for (let i = 0; i < list.length; i++) { if (list[i].id === "aix-work-ptc") entry = list[i]; }
      if (!entry) {
        const hasSrc = list.some((p) => p.id === "ptc" || p.id === "code");
        return { exists: false, available: hasSrc, error: hasSrc ? undefined : "本环境无 PTC 内置模式" };
      }
      return { exists: true, path: entry.path };
    } catch (e) { return { exists: false, error: String(e) }; }
  };
  // PTC ensure：源探测 ptc/code 回退 + 底座跟随重生成 + AIX-WORK 变换
  const AIXWORK_PTC_ID = "aix-work-ptc";
  async function ensureAixworkPtc(autoCreate) {
    const ap = ctx.get("agentPresets");
    if (!ap) throw new Error("agentPresets service unavailable");
    const list = await ap.list();
    let entry = null;
    for (let i = 0; i < list.length; i++) { if (list[i].id === AIXWORK_PTC_ID) entry = list[i]; }
    // 源探测：内置 PTC 的 id 随版本为 "ptc"（≥0.1.2）或 "code"（0.1.1）
    let srcEntry = null;
    const srcCands = ["ptc", "code"];
    for (let i = 0; i < srcCands.length; i++) {
      for (let j = 0; j < list.length; j++) { if (list[j].id === srcCands[i]) { srcEntry = list[j]; break; } }
      if (srcEntry) break;
    }
    if (!entry) {
      if (!autoCreate) return { exists: false };
      if (!srcEntry) return { exists: false, available: false, error: "本环境无 PTC 内置模式（缺 ptc/code preset）" };
      await ap.copy(srcEntry.id, AIXWORK_PTC_ID, "AIX-WORK PTC 模式");
    }
    // 底座跟随：副本 mode 与内置源不一致（跨版本升级）→ 以内置源 yml 重生成
    let baseRegenerated = false;
    const r = await resolvePresetYml(entry, AIXWORK_PTC_ID);
    if (r && srcEntry && srcEntry.path) {
      try {
        const srcYml = await readTextFile(srcEntry.path.replace(/\\/g, "/").replace(/\/$/, "") + "/agent.cordis.yml");
        if (srcYml) {
          const m1 = /mode:\s*["']?([a-z]+)["']?/.exec(r.yml);
          const m2 = /mode:\s*["']?([a-z]+)["']?/.exec(srcYml);
          if (m1 && m2 && m1[1] !== m2[1]) {
            await writeTextFile(r.ymlPath, srcYml);
            console.log("AIX-WORK ptc preset 底座过期（mode " + m1[1] + " -> " + m2[1] + "），跟随内置源重生成");
            baseRegenerated = true;
            r.yml = srcYml;
          }
        }
      } catch (eSrc) {}
    }
    // 套 AIX-WORK 变换（幂等）
    let transformed = false;
    if (r) {
      const t = await applyAixworkTransform(r.ymlPath, r.yml);
      transformed = t.updated;
    }
    return { exists: true, created: !entry, updated: baseRegenerated || transformed, path: r ? r.ymlPath : (entry && entry.path) };
  }
  handlers["applyPreset"] = async () => {
    try {
      const r = await ensureAixworkPreset(true);
      return r;
    } catch (e) { return { exists: false, error: String(e) }; }
  };
  handlers["applyPresetPTC"] = async () => {
    try {
      const r = await ensureAixworkPtc(true);
      return r;
    } catch (e) { return { exists: false, error: String(e) }; }
  };
  handlers["getConfig"] = async () => state.config;
  handlers["saveConfig"] = async (a) => await saveConfig(a);
  handlers["getMcpStatus"] = async () => {
    const r = [];
    for (const nm in state.mcpServers) {
      const c = state.mcpServers[nm];
      const conn = state.mcpConnections[nm] || {};
      const h = state.healthStatus[nm] || {};
      r.push({ name: nm, type: c.type || "stdio", connected: conn.connected || false, tools: (conn.tools || []).map((t) => ({ name: t.name, description: t.description })), error: conn.error || null, healthStatus: h.status || "grey", httpStatus: h.httpStatus || null, healthError: h.error || null, attempts: conn.attempts || 0 });
    }
    return r;
  };
  handlers["getSkills"] = async () => state.skills.map((s) => ({ name: s.name, description: s.description, whenToUse: s.whenToUse, path: s.path }));
  handlers["getSkillContent"] = async (a) => {
    const nm = a && a.name;
    for (let i = 0; i < state.skills.length; i++) { if (state.skills[i].name === nm) return { name: nm, content: state.skills[i].content || "(no content)" }; }
    return { name: nm || "", content: "Skill not found" };
  };
  handlers["getRules"] = async () => state.rules.map((r) => ({ name: r.name, path: r.path, content: r.content }));
  handlers["getDiagnostics"] = async () => ({
    config: state.config,
    mcpServers: Object.keys(state.mcpServers).map((n) => { const c = state.mcpConnections[n] || {}; const h = state.healthStatus[n] || {}; return { name: n, type: state.mcpServers[n].type || "stdio", connected: c.connected || false, toolCount: (c.tools || []).length, healthStatus: h.status || "grey", error: c.error || h.error || null }; }),
    skillsCount: state.skills.length,
    rulesCount: state.rules.length,
    registeredTools: state.registeredTools,
    diagnostics: state.diagnostics
  });
  // 变更检测 + 手动同步 RPC
  handlers["checkRulesUpdate"] = async () => {
    const current = await collectMtimes([assetsRulesDir].concat(state.config.rulePaths || []), false);
    const changed = [];
    for (const p in current) {
      const old = state.rulesMtime[p] || -1;
      if (current[p] > old) changed.push(p.split("/").pop());
    }
    const oldCount = Object.keys(state.rulesMtime).length;
    const newCount = Object.keys(current).length;
    if (newCount !== oldCount && changed.length === 0) {
      // 文件数量变化但 mtime 没变（新增/删除）
      changed.push("(文件数量变化)");
    }
    return { hasUpdate: changed.length > 0 || newCount !== oldCount, changedFiles: changed };
  };
  handlers["checkSkillsUpdate"] = async () => {
    const allSkillDirs = [assetsSkillsDir, assetsPluginsDir].concat(state.config.skillPaths || []).concat(state.config.pluginCachePaths || []);
    const allMtimes = await collectMtimes(allSkillDirs, true);
    const skillFiles = {};
    for (const p in allMtimes) { if (p.endsWith("SKILL.md")) skillFiles[p] = allMtimes[p]; }
    const changed = [];
    for (const p in skillFiles) {
      const old = state.skillsMtime[p] || -1;
      if (skillFiles[p] > old) changed.push(p.split("/").slice(-2).join("/"));
    }
    const oldCount = Object.keys(state.skillsMtime).length;
    const newCount = Object.keys(skillFiles).length;
    return { hasUpdate: changed.length > 0 || newCount !== oldCount, changedFiles: changed };
  };
  handlers["checkMcpUpdate"] = async () => {
    const paths = state.config.mcpPaths || [];
    const changed = [];
    for (let i = 0; i < paths.length; i++) {
      try {
        const target = await fs.resolve(paths[i]);
        const info = await fs.stat(target);
        const old = state.mcpConfigMtime[paths[i]] || -1;
        if (info && info.mtimeMs && info.mtimeMs > old) changed.push(paths[i].split("/").pop());
      } catch {}
    }
    return { hasUpdate: changed.length > 0, changedFiles: changed };
  };
  handlers["syncRules"] = async () => { await syncRules(); return { ok: true, count: state.rules.length }; };
  handlers["syncSkills"] = async () => {
    for (let j = 0; j < skillDisposers.length; j++) { try { skillDisposers[j](); } catch {} }
    skillDisposers.length = 0;
    state.registeredTools = state.registeredTools.filter((t) => !t.name.startsWith("skill_"));
    await scanSkills();
    return { ok: true, count: state.skills.length };
  };
  handlers["syncMcp"] = async () => {
    for (const nm in state.mcpConnections) { if (state.mcpConnections[nm] && state.mcpConnections[nm].close) { try { state.mcpConnections[nm].close(); } catch {} } }
    state.mcpConnections = {};
    for (let i = 0; i < toolDisposers.length; i++) { try { toolDisposers[i](); } catch {} }
    toolDisposers.length = 0;
    // 只清理 MCP 工具记录，保留 skill 工具记录
    state.registeredTools = state.registeredTools.filter((t) => !t.name.startsWith("mcp_"));
    await loadMcpServers();
    await connectAllMcpServers();
    await runHealthCheck();
    return { ok: true, count: Object.keys(state.mcpServers).length };
  };
  handlers["reload"] = async () => { await reloadAll(); return { success: true }; };
  handlers["healthCheck"] = async () => await runHealthCheck();
  handlers["reconnect"] = async (a) => {
    const nm = a.serverName;
    const config = state.mcpServers[nm];
    if (!config) return { error: "Not found: " + nm };
    if (state.mcpConnections[nm] && state.mcpConnections[nm].close) { try { state.mcpConnections[nm].close(); } catch {} }
    delete state.mcpConnections[nm];
    try { await connectMcpServer(nm, config); return { success: true }; } catch (e) { return { error: String(e) }; }
  };
  // theme RPC handlers
  handlers["getTheme"] = async () => state.config.theme || null;
  handlers["saveTheme"] = async (a) => {
    var t = a || {};
    if (typeof t.fontFamily === "string") state.config.theme.fontFamily = t.fontFamily;
    if (typeof t.fontSize === "number") state.config.theme.fontSize = t.fontSize;
    if (typeof t.codeFontSize === "number") state.config.theme.codeFontSize = t.codeFontSize;
    if (typeof t.lineHeight === "number") state.config.theme.lineHeight = t.lineHeight;
    if (typeof t.preset === "string") state.config.theme.preset = t.preset;
    if (typeof t.dialogWidth === "number") state.config.theme.dialogWidth = t.dialogWidth;
    if (typeof t.tableStyle === "string") state.config.theme.tableStyle = t.tableStyle;
    if (t.background && typeof t.background === "object") {
      if (typeof t.background.image === "string") state.config.theme.background.image = t.background.image;
      if (typeof t.background.opacity === "number") state.config.theme.background.opacity = t.background.opacity;
      if (typeof t.background.blur === "number") state.config.theme.background.blur = t.background.blur;
      if (typeof t.background.brightness === "number") state.config.theme.background.brightness = t.background.brightness;
    }
    if (t.customTheme && typeof t.customTheme === "object") {
      if (typeof t.customTheme.applied === "boolean") state.config.theme.customTheme.applied = t.customTheme.applied;
      if (t.customTheme.light) Object.assign(state.config.theme.customTheme.light, t.customTheme.light);
      if (t.customTheme.dark) Object.assign(state.config.theme.customTheme.dark, t.customTheme.dark);
    }
    await writeTextFile(dshHome + "/aix-work-config.json", JSON.stringify(state.config, null, 2));
    return { success: true, theme: state.config.theme };
  };
  handlers["resetTheme"] = async () => {
    state.config.theme = {
      fontFamily: "", fontSize: 0, codeFontSize: 0, lineHeight: 0, preset: "",
      dialogWidth: 0, tableStyle: "",
      background: { image: "", opacity: 100, blur: 0, brightness: 100 },
      customTheme: {
        applied: false,
        light: { accent: "#4d6bfe", background: "#f7f8fa", foreground: "#262626", contrast: 50 },
        dark: { accent: "#7c91ff", background: "#171719", foreground: "#f3f3f3", contrast: 50 },
      },
    };
    await writeTextFile(dshHome + "/aix-work-config.json", JSON.stringify(state.config, null, 2));
    return { success: true, theme: state.config.theme };
  };

  // 查询生产 DSH 已安装的插件列表
  async function getInstalledPlugins() {
    try {
      const profilePkgPath = dshHome + "/profiles/web/package.json";
      const pkg = await readJsonFile(profilePkgPath);
      if (!pkg || !pkg.dependencies) return [];
      const names = Object.keys(pkg.dependencies);
      const items = [];
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const dep = pkg.dependencies[name];
        // 提取版本号和 tgzBaseName
        let version = "";
        let tgzBaseName = "";
        if (dep.startsWith("file:")) {
          const fn = dep.split("/").pop().replace(/\.tgz$/, "");
          const m = fn.match(/-(\d+\.\d+\.\d+)$/);
          if (m) {
            version = m[1];
            tgzBaseName = fn.substring(0, m.index);
          }
        } else if (dep.startsWith("link:")) {
          // link: 安装（本地开发模式）：读 link 目标 package.json 的真实版本，否则 link 路径会被误当版本号
          const linkDir = dep.substring(5).replace(/\\/g, "/").replace(/\/$/, "");
          const linkPkg = await readJsonFileQuiet(linkDir + "/package.json");
          version = (linkPkg && linkPkg.version) || "";
        } else {
          version = dep.replace(/[\^~>=<]/g, "");
          // npm pack 命名规则：@scope/name → scope-name（用于和 tgz 文件名匹配）
          tgzBaseName = name.replace(/^@/, "").replace(/\//g, "-");
        }
        // 非语义版本（workspace:/git:/随机串等）置空，防止被误当版本号判出假的"可更新"
        if (!/^\d+\.\d+\.\d+/.test(version)) { version = ""; }
        items.push({ name: name, version: version, source: dep, tgzBaseName: tgzBaseName });
      }
      return items;
    } catch (e) { state.diagnostics.push("getInstalledPlugins: " + String(e)); return []; }
  }

  // 安装 DSH 插件（通过 dsh plugin --profile web add）
  async function installDshPlugin(tgzPath) {
    try {
      // Windows 关键修复：dsh 是 npm shim（dsh.cmd），child_process.spawn 不走 shell 时
      // 只解析 .exe，直接 spawn "dsh" 会 ENOENT —— 必须用 cmd.exe /c 包一层
      let argv;
      if (process.platform === "win32") {
        argv = ["cmd.exe", "/c", "dsh", "plugin", "--profile", "web", "add", "file:" + tgzPath];
      } else {
        argv = ["dsh", "plugin", "--profile", "web", "add", "file:" + tgzPath];
      }
      // Cordis subprocess 会丢弃环境里的所有 DSH_* 变量（managed namespace 设计），
      // 必须在 spec.env 里显式传 DSH_HOME，否则 dsh CLI 回退默认 ~/.dsh，
      // dev 里点的安装会装到生产 profile（已踩坑）
      // 清理 tgz 已不存在的 file:/link: 悬空引用（否则 pnpm add 解析全树 ENOENT 卡死升级）
      try {
        const pkgPath = dshHome + "/profiles/web/package.json";
        const pkgBefore = await readJsonFileQuiet(pkgPath);
        if (pkgBefore && pkgBefore.dependencies) {
          let dangling = false;
          for (const dk of Object.keys(pkgBefore.dependencies)) {
            const dv = String(pkgBefore.dependencies[dk]);
            const fm = dv.match(/^(?:file|link):(.+)$/);
            if (!fm) continue;
            const fp = fm[1].replace(/\\/g, "/");
            if (!/\.tgz$/i.test(fp)) continue;
            let exists = false;
            try { const ft = await fs.resolve(fp); const fi = await fs.stat(ft); exists = !!fi; } catch (e3) {}
            if (!exists) { delete pkgBefore.dependencies[dk]; dangling = true; console.log("AIX-WORK installDshPlugin: 清理悬空引用", dk, "=", dv); }
          }
          if (dangling) await writeTextFile(pkgPath, JSON.stringify(pkgBefore, null, 2) + "\n");
        }
      } catch (eDangle) { console.log("AIX-WORK installDshPlugin: 悬空引用清理失败（继续原流程）:", String(eDangle)); }

      const spec = { argv, cwd: process.cwd(), env: { DSH_HOME: dshHome }, stdio: { stdin: "ignore", stdout: { maxBytes: 1048576 }, stderr: { maxBytes: 1048576 } }, graceMs: 120000 };
      const handle = subprocess.spawn(spec);
      await handle.done;
      let output = "";
      if (handle.collected && handle.collected.stdout) output = handle.collected.stdout.readFrom(0).text;
      if (handle.collected && handle.collected.stderr) {
        const err = handle.collected.stderr.readFrom(0).text;
        if (err) output += "\n" + err;
      }
      // host 日志留痕，便于排查安装失败
      console.log("AIX-WORK installDshPlugin argv:", argv.join(" "));
      console.log("AIX-WORK installDshPlugin output:", (output || "(empty)").substring(0, 800));
      // "Done in" 才算成功（"added" 会被 "added 0" 误判）；再校验 profile 写入
      const ok = output.indexOf("Done in") >= 0;
      if (!ok) {
        return { success: false, output: output || ("spawn 失败，无输出（argv: " + argv.join(" ") + "）") };
      }
      // 防假成功：pnpm 输出 Done 不代表依赖真写进了 profile 的 package.json
      // （此前 DSH_HOME 丢失时 pnpm 对"生产已有该包"输出 Already up to date/Done，但 dev 什么都没装）
      const pkgAfter = await readJsonFileQuiet(dshHome + "/profiles/web/package.json");
      const depsAfter = (pkgAfter && pkgAfter.dependencies) || {};
      const normTgz = tgzPath.replace(/\\/g, "/");
      const written = Object.keys(depsAfter).some(function(k) { return String(depsAfter[k]).replace(/\\/g, "/").indexOf(normTgz) >= 0; });
      console.log("AIX-WORK installDshPlugin verify: package.json 写入 =", written);
      if (!written) {
        return { success: false, output: output + "\n[校验失败] profile package.json 未写入该依赖（可能装到了错误的 DSH_HOME）" };
      }
      return { success: true, output: output };
    } catch (e) { return { success: false, output: String(e) }; }
  }

  // ===== 插件仓库检查更新（以云端 dsh-plugins 仓库为唯一数据源）=====
  // gitlab.alibaba-inc.com 是公司内网，公网无法访问；改用 Gitee 公网仓库
  const PLUGIN_REPO_URL_SSH = "git@gitee.com:huxu1052265183/dsh-plugins.git";
  const PLUGIN_REPO_URL_HTTPS = "https://gitee.com/huxu1052265183/dsh-plugins.git";
  const PLUGIN_REPO_WEB = "https://gitee.com/huxu1052265183/dsh-plugins";
  // 检查结果缓存（插件初始化时自动查一次，客户端进 Tab 直接读缓存）
  let updateCheckCache = null;

  // 运行 git 命令
  async function runGit(args, cwd) {
    const spec = { argv: ["git"].concat(args), cwd: cwd, stdio: { stdin: "ignore", stdout: { maxBytes: 2097152 }, stderr: { maxBytes: 2097152 } }, graceMs: 120000 };
    const handle = subprocess.spawn(spec);
    await handle.done;
    let output = "";
    let errText = "";
    if (handle.collected && handle.collected.stdout) output = handle.collected.stdout.readFrom(0).text;
    if (handle.collected && handle.collected.stderr) errText = handle.collected.stderr.readFrom(0).text;
    return { output: output, stderr: errText };
  }

  // 判断 git 错误是否为权限问题
  function isGitPermissionError(stderr) {
    return /permission denied|publickey|could not read from remote repository|authentication failed|host key verification/i.test(stderr);
  }

  // 同步远端仓库到本地缓存：已克隆则 fetch+reset，否则浅克隆
  // URL 协议自动回退：origin 当前协议失败（SSH 无 key / HTTPS 需凭据）时切换另一种协议重试
  async function syncPluginRepo(repoDir) {
    const pathMod = _require("path");
    let cloned = false;
    try {
      const target = await fs.resolve(repoDir.replace(/\\/g, "/") + "/.git/HEAD");
      const info = await fs.stat(target);
      cloned = !!info;
    } catch { cloned = false; }

    const urls = [PLUGIN_REPO_URL_SSH, PLUGIN_REPO_URL_HTTPS];
    // 若已有仓库，按 origin 的当前 URL 排序（当前的优先尝试）
    if (cloned) {
      const rem = await runGit(["remote", "get-url", "origin"], repoDir);
      const cur = (rem.output || "").trim();
      if (cur && urls.indexOf(cur) < 0) urls.unshift(cur);
      else if (cur) { urls.sort(function(a, b) { return a === cur ? -1 : (b === cur ? 1 : 0); }); }
    }

    let lastPermErr = false;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        if (cloned) {
          // 确保指向当前协议的 URL，再 fetch + reset
          await runGit(["remote", "set-url", "origin", url], repoDir);
          const fetched = await runGit(["fetch", "--depth", "1", "origin"], repoDir);
          if (fetched.stderr && isGitPermissionError(fetched.stderr)) { lastPermErr = true; continue; }
          await runGit(["reset", "--hard", "FETCH_HEAD"], repoDir);
          return { ok: true };
        } else {
          // 浅克隆前先清掉半成品目录
          try { await runGit(["--version"], repoDir); } catch {}
          const clonedRes = await runGit(["clone", "--depth", "1", url, repoDir], pathMod.dirname(repoDir));
          if (clonedRes.stderr && isGitPermissionError(clonedRes.stderr)) { lastPermErr = true; continue; }
          return { ok: true };
        }
      } catch (e) {
        if (isGitPermissionError(String(e))) { lastPermErr = true; continue; }
        return { ok: false, permissionDenied: false, message: "仓库访问失败: " + String(e) };
      }
    }
    if (lastPermErr) return { ok: false, permissionDenied: true, message: "无仓库访问权限（SSH key 未配置且 HTTPS 需要凭据）" };
    return { ok: false, permissionDenied: false, message: "仓库访问失败" };
  }

  // 检查插件仓库更新：克隆/拉取仓库 → 读各插件 plugin.json 清单 → 对比已安装
  // 有清单读清单（唯一事实源），无清单回退解析 tgz 文件名（容错）
  async function checkPluginUpdates() {
    const pathMod = _require("path");
    const repoDir = pathMod.join(dshHome, "dsh-plugins-repo-cache");
    const fsRepoDir = dshHome + "/dsh-plugins-repo-cache";
    // 1. 克隆或拉取仓库（自动尝试 SSH 和 HTTPS 协议回退）
    const syncResult = await syncPluginRepo(repoDir);
    if (!syncResult.ok) {
      return { ok: false, permissionDenied: syncResult.permissionDenied, repoWeb: PLUGIN_REPO_WEB, message: syncResult.message };
    }
    // 2. 解析仓库里各插件目录：优先读 plugin.json 清单，无清单回退解析 tgz 文件名
    let entries;
    try { entries = await listDir(fsRepoDir); } catch (e) { return { ok: false, permissionDenied: false, message: "读取仓库目录失败: " + String(e) }; }
    const remotePlugins = [];
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].type !== "directory" || entries[i].name === ".git") continue;
      const subDir = fsRepoDir + "/" + entries[i].name;
      const subEntries = await listDir(subDir);
      let manifest = null;
      let tgzFiles = [];
      for (let j = 0; j < subEntries.length; j++) {
        if (subEntries[j].type === "file" && subEntries[j].name === "plugin.json") {
          manifest = await readJsonFile(subDir + "/plugin.json");
        } else if (subEntries[j].type === "file" && subEntries[j].name.endsWith(".tgz")) {
          tgzFiles.push(subEntries[j].name);
        }
      }
      if (manifest && manifest.name && manifest.version) {
        // 清单为准：tgz 字段指向同目录安装包文件
        const tgzFile = manifest.tgz || "";
        const tgzExists = tgzFile && tgzFiles.indexOf(tgzFile) >= 0;
        remotePlugins.push({
          name: manifest.name,
          version: manifest.version,
          description: manifest.description || "",
          path: subDir,
          tgzPath: tgzExists ? subDir + "/" + tgzFile : "",
          tgzMissing: !!tgzFile && !tgzExists,  // 清单指向的 tgz 不存在 → 单项警告
        });
      } else if (tgzFiles.length > 0) {
        // 回退：从 tgz 文件名解析，多个 tgz 取最新版本
        let best = null;
        for (let j = 0; j < tgzFiles.length; j++) {
          const baseName = tgzFiles[j].replace(/\.tgz$/, "");
          const m = baseName.match(/-(\d+\.\d+\.\d+)$/);
          if (!m) continue;
          if (!best || compareVersion(m[1], best.version) > 0) {
            best = { version: m[1], file: tgzFiles[j] };
          }
        }
        if (best) {
          remotePlugins.push({
            name: entries[i].name,
            version: best.version,
            description: "",
            path: subDir,
            tgzPath: subDir + "/" + best.file,
            tgzMissing: false,
          });
        }
      } else {
        // 源码形态回退：目录只有 package.json（无清单无 tgz，如云端旧结构的 aix-work-dev）也解析显示
        const srcPkg = await readJsonFileQuiet(subDir + "/package.json");
        if (srcPkg && srcPkg.name && srcPkg.version) {
          remotePlugins.push({
            name: srcPkg.name,
            version: srcPkg.version,
            description: srcPkg.description || "",
            path: subDir,
            tgzPath: "",
            tgzMissing: false,
          });
        }
      }
    }
    // 3. 对比已安装版本，给出每个云端插件的完整状态
    const installed = await getInstalledPlugins();
    const installedByName = {};
    const installedByLastName = {};
    for (let i = 0; i < installed.length; i++) {
      installedByName[installed[i].name] = installed[i].version;
      if (installed[i].name.indexOf("/") >= 0) {
        const lastName = installed[i].name.split("/").pop();
        if (lastName && !installedByLastName[lastName]) installedByLastName[lastName] = installed[i].version;
      }
    }
    const plugins = [];
    let updateCount = 0;
    for (let i = 0; i < remotePlugins.length; i++) {
      const rp = remotePlugins[i];
      let instVer = installedByName[rp.name];
      if (!instVer) instVer = installedByLastName[rp.name] || installedByName[rp.name.split("/").pop()];
      const cmp = instVer ? compareVersion(rp.version || "0.0.0", instVer) : 1;
      const item = {
        name: rp.name,
        version: rp.version,
        description: rp.description,
        tgzPath: rp.tgzPath,
        tgzMissing: rp.tgzMissing,
        installedVersion: instVer || "",
        installed: !!instVer && cmp <= 0,
        canUpdate: !!instVer && cmp > 0,
        notInstalled: !instVer,
      };
      if (item.canUpdate || item.notInstalled) updateCount++;
      plugins.push(item);
    }
    const result = { ok: true, permissionDenied: false, repoWeb: PLUGIN_REPO_WEB, plugins: plugins, updateCount: updateCount, totalRemote: remotePlugins.length, checkedAt: Date.now() };
    updateCheckCache = { result: result, checkedAt: Date.now() };
    // host 日志：每次检查的判定摘要，排查"安装后列表不更新"
    try {
      console.log("AIX-WORK checkPluginUpdates 判定:", plugins.map(function(p) { return p.name + "=" + (p.installed ? "已装v" + p.installedVersion : (p.canUpdate ? "可更新v" + p.version : "未装")); }).join(" | "));
    } catch (logErr) {}
    return result;
  }

  // 读取缓存的检查结果（客户端进 Tab 直接展示，不重新连仓库）
  async function getCachedUpdateCheck() {
    return updateCheckCache;
  }

  // 递归扫描 mcp.json 文件
  async function scanMcpFiles(customBasePath) {
    const results = [];
    const scannedDirs = new Set();
    const searchDirs = [];
    // 优先用传入的 basePath，其次用配置里的
    const bp = (customBasePath || state.config.basePath || "").replace(/\\/g, "/");
    if (bp) {
      const baseDir = bp.replace(/\/\.claude$/, "");
      searchDirs.push(baseDir);
      searchDirs.push(bp);
      if (!bp.endsWith("/.claude")) searchDirs.push(bp + "/.claude");
    }
    // 也扫描已配置的 mcpPaths 的父目录
    for (let i = 0; i < (state.config.mcpPaths || []).length; i++) {
      const mp = state.config.mcpPaths[i];
      const dir = mp.split("/").slice(0, -1).join("/");
      if (dir) searchDirs.push(dir);
    }

    async function scanDir(dirPath, depth) {
      if (depth > 6 || scannedDirs.has(dirPath)) return;
      scannedDirs.add(dirPath);
      let entries;
      try { entries = await listDir(dirPath); } catch { return; }
      for (let i = 0; i < entries.length; i++) {
        const fullPath = joinPath(dirPath, entries[i].name);
        if (entries[i].type === "file" && (entries[i].name === "mcp.json" || entries[i].name === ".mcp.json")) {
          const content = await readTextFile(fullPath);
          let serverCount = 0;
          let serverNames = [];
          if (content) {
            try {
              const data = JSON.parse(content);
              if (data.mcpServers) {
                serverNames = Object.keys(data.mcpServers);
                serverCount = serverNames.length;
              }
            } catch {}
          }
          results.push({ path: fullPath, fileName: entries[i].name, serverCount: serverCount, serverNames: serverNames, content: content ? content.substring(0, 200) : "" });
        } else if (entries[i].type === "directory" && entries[i].name !== "node_modules" && entries[i].name !== ".git" && entries[i].name !== "dist") {
          await scanDir(fullPath, depth + 1);
        }
      }
    }
    for (let i = 0; i < searchDirs.length; i++) {
      await scanDir(searchDirs[i], 0);
    }
    return results;
  }

  handlers["getInstalledPlugins"] = async () => await getInstalledPlugins();
  handlers["installDshPlugin"] = async (a) => await installDshPlugin(a.tgzPath);
  // 卸载 DSH 插件（dsh plugin --profile web rm <全名>；短名会 pnpm 报错，必须传完整包名）
  async function uninstallDshPlugin(name) {
    try {
      if (!name) return { success: false, output: "缺少插件名" };
      let argv;
      if (process.platform === "win32") {
        argv = ["cmd.exe", "/c", "dsh", "plugin", "--profile", "web", "rm", name];
      } else {
        argv = ["dsh", "plugin", "--profile", "web", "rm", name];
      }
      const spec = { argv, cwd: process.cwd(), env: { DSH_HOME: dshHome }, stdio: { stdin: "ignore", stdout: { maxBytes: 1048576 }, stderr: { maxBytes: 1048576 } }, graceMs: 120000 };
      const handle = subprocess.spawn(spec);
      await handle.done;
      let output = "";
      if (handle.collected && handle.collected.stdout) output = handle.collected.stdout.readFrom(0).text;
      if (handle.collected && handle.collected.stderr) {
        const err = handle.collected.stderr.readFrom(0).text;
        if (err) output += "\n" + err;
      }
      console.log("AIX-WORK uninstallDshPlugin argv:", argv.join(" "));
      console.log("AIX-WORK uninstallDshPlugin output:", (output || "(empty)").substring(0, 500));
      // 防假成功：确认依赖行真的从 profile package.json 移除
      const pkgAfter = await readJsonFileQuiet(dshHome + "/profiles/web/package.json");
      const depsAfter = (pkgAfter && pkgAfter.dependencies) || {};
      const gone = depsAfter[name] === undefined;
      console.log("AIX-WORK uninstallDshPlugin verify: 依赖已移除 =", gone);
      if (!gone) {
        return { success: false, output: output + "\n[校验失败] profile package.json 中该依赖未移除" };
      }
      return { success: true, output: output };
    } catch (e) { return { success: false, output: String(e) }; }
  }
  handlers["uninstallDshPlugin"] = async (a) => await uninstallDshPlugin(a && a.name);
  handlers["scanMcpFiles"] = async (a) => await scanMcpFiles(a && a.basePath);
  handlers["checkPluginUpdates"] = async () => await checkPluginUpdates();
  handlers["getCachedUpdateCheck"] = async () => await getCachedUpdateCheck();
  // 自动填充路径：递归扫描 basePath 下所有名为 skills/rules/plugins 的目录（使用 Node fs 绕过 DSH fs 沙箱）
  handlers["autoFillPaths"] = async (a) => {
    console.log("[autoFillPaths] raw arg:", JSON.stringify(a));
    const bp = (a && typeof a === 'object' && a.basePath && a.basePath.replace(/\\/g, "/")) || (typeof a === 'string' ? a.replace(/\\/g, "/") : "");
    const results = { skillPaths: [], rulePaths: [], pluginCachePaths: [] };
    if (!bp) {
      results.debug = { error: "basePath is empty", receivedArg: a };
      return results;
    }
    console.log("[autoFillPaths] scanning basePath:", bp);

    // 使用 Node fs 直接递归扫描（绕过 DSH fs 的沙箱限制）
    const nodeFs = _require("fs");
    console.log("[autoFillPaths] nodeFs loaded:", typeof nodeFs);

    function findDirs(startPath, dirNames, depth) {
      if (depth === undefined) depth = 0;
      const found = [];
      if (depth > 10) return found;
      let entries;
      try {
        entries = nodeFs.readdirSync(startPath, { withFileTypes: true });
        console.log("[autoFillPaths] readdirSync success:", startPath, "entries:", entries.length);
      } catch (e) {
        console.log("[autoFillPaths] readdir error:", startPath, String(e));
        return found;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (dirNames.includes(entry.name)) {
          console.log("[autoFillPaths] FOUND:", startPath + "/" + entry.name);
          found.push(startPath + "/" + entry.name);
        } else {
          const subFound = findDirs(startPath + "/" + entry.name, dirNames, depth + 1);
          found.push(...subFound);
        }
      }
      return found;
    }

    const skills = findDirs(bp, ["skills"]);
    const rules = findDirs(bp, ["rules"]);
    const plugins = findDirs(bp, ["plugins"]);
    console.log("[autoFillPaths] found skills:", skills.length, "rules:", rules.length, "plugins:", plugins.length);
    results.skillPaths = skills;
    results.rulePaths = rules;
    results.pluginCachePaths = plugins;
    // 调试信息（临时）：返回扫描过程的关键状态，便于定位问题
    let debugTopEntries = [];
    try { debugTopEntries = nodeFs.readdirSync(bp, { withFileTypes: true }).map(function(e) { return e.name + (e.isDirectory() ? "/" : ""); }); } catch (e) { debugTopEntries = ["readdir failed: " + String(e)]; }
    results.debug = { basePath: bp, topEntries: debugTopEntries.slice(0, 30) };
    return results;
  };

  // 初始化工作区目录结构
  handlers["initWorkspace"] = async (a) => {
    const inputPath = (a && a.path || "").replace(/\\/g, "/");
    if (!inputPath || inputPath.trim() === "") throw new Error("路径不能为空");
    // 检查目录是否已存在且非空
    try {
      const target = await fs.resolve(inputPath);
      const info = await fs.stat(target);
      if (info) {
        const entries = await fs.listDir(target);
        if (entries && entries.length > 0) {
          throw new Error("目录已存在且非空，请选择空目录");
        }
      }
    } catch (e) {
      // stat 或 listDir 抛异常说明目录不存在，可以继续创建
      if (String(e).includes("已存在且非空")) throw e;
    }
    // 用 writeText 写占位文件来创建目录（writeText 会自动创建父目录）
    const placeholderFiles = [
      { path: inputPath + "/skills/.gitkeep", content: "" },
      { path: inputPath + "/rules/.gitkeep", content: "" },
      { path: inputPath + "/plugins/cache/.gitkeep", content: "" },
      { path: inputPath + "/.dsp/plugins/.gitkeep", content: "" },
      { path: inputPath + "/.claude/docs/.gitkeep", content: "" },
      { path: inputPath + "/.claude/scripts/.gitkeep", content: "" },
    ];
    const created = [];
    for (let i = 0; i < placeholderFiles.length; i++) {
      try {
        const target = await fs.resolve(placeholderFiles[i].path);
        await fs.writeText(target, placeholderFiles[i].content);
        created.push(placeholderFiles[i].path);
      } catch (e) {
        state.diagnostics.push("initWorkspace writeText: " + placeholderFiles[i].path + " " + String(e));
      }
    }
    // 创建 .mcp.json 文件（如果不存在）
    const mcpFilePath = inputPath + "/.mcp.json";
    try {
      const target = await fs.resolve(mcpFilePath);
      const info = await fs.stat(target);
      if (!info) {
        await fs.writeText(target, JSON.stringify({ mcpServers: {} }, null, 2));
        created.push(mcpFilePath);
      }
    } catch (e) {
      // stat 抛异常说明文件不存在，直接写
      try {
        const target = await fs.resolve(mcpFilePath);
        await fs.writeText(target, JSON.stringify({ mcpServers: {} }, null, 2));
        created.push(mcpFilePath);
      } catch (e2) {
        state.diagnostics.push("initWorkspace mcp.json: " + String(e2));
      }
    }
    return {
      basePath: inputPath,
      skillPaths: [inputPath + "/skills"],
      rulePaths: [inputPath + "/rules"],
      pluginCachePaths: [inputPath + "/plugins/cache"],
      mcpPaths: [mcpFilePath],
      created: created,
    };
  };


  // 关键修复：不再使用 connection.rpc.intercept("/api", ...)，因为它与 Gateway 冲突。
  // 改用 connection.fetch.register(...) 注册精确的 Fetch 路由，让 Gateway 可以处理其他 /api 端点。
  if (connection && connection.fetch) {
    // 注册所有 aixwork 端点的精确路由
    const aixworkEndpoints = Object.keys(handlers).map(method => `aixwork/${method}`);
    for (const endpoint of aixworkEndpoints) {
      const path = `/api/${endpoint}`;
      connection.fetch.register({
        path: path,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const methodName = endpoint.slice("aixwork/".length);
          const handler = handlers[methodName];
          if (!handler) return new Response(JSON.stringify({ error: 'Unknown endpoint' }), { status: 404 });
          try {
            let payload = {};
            const contentType = request.headers.get('content-type') || '';
            const text = await request.text();
            if (text) payload = JSON.parse(text);
            const value = await handler(payload);
            return new Response(JSON.stringify({ ok: true, value }), {
              headers: { 'content-type': 'application/json' },
            });
          } catch (e) {
            return new Response(JSON.stringify({
              ok: false,
              error: { code: 'handler-error', message: String(e), details: { issues: [] } }
            }), {
              headers: { 'content-type': 'application/json' },
            });
          }
        }
      });
    }
  }

  // 诊断工具
  try {
    const dt = makeTool({
      name: "aix_work_diag",
      description: "Query AIX-WORK plugin status: MCP servers, skills, rules, health checks.",
      parameters: { type: "object", properties: { section: { type: "string", enum: ["all", "mcp", "skills", "rules", "config", "health"], description: "Section to query. Default: all" } } },
      execute: async (args) => {
        const s = (args && args.section) || "all";
        const r = {};
        if (s === "all" || s === "config") r.config = state.config;
        if (s === "all" || s === "mcp") { r.mcp = []; for (const n in state.mcpServers) { const c = state.mcpConnections[n] || {}; r.mcp.push({ name: n, type: state.mcpServers[n].type || "stdio", connected: c.connected || false, tools: (c.tools || []).length, error: c.error || null }); } }
        if (s === "all" || s === "skills") r.skills = state.skills.length;
        if (s === "all" || s === "rules") r.rules = state.rules.length;
        if (s === "all" || s === "health") r.health = state.healthStatus;
        return { result: JSON.stringify(r, null, 2) };
      }
    });
    const d = ctx.tools.register(dt);
    ctx.effect(() => () => { try { d(); } catch {} });
  } catch (e) { console.log("Diag tool failed:", String(e)); }

  // 初始化：loadConfig+reloadAll 填充 state（不注册 sp.section，由 session/created 统一处理）
  ctx.effect(() => {
    // 存储 reloadAll promise，session/created 可等待其完成
    initReloadAllPromise = loadConfig().then(() => reloadAll());
    initReloadAllPromise.then(() => {
      debugLog("INIT: reloadAll done, plugin ready");
      console.log("AIX-WORK initialized");
    }).catch((e) => { debugLog("INIT ERROR: " + String(e)); console.log("AIX-WORK init error:", String(e)); });
    // 插件初始化时后台自动检查一次插件仓库更新（结果缓存，客户端进配置 Tab 直接读缓存）
    // 延迟 15 秒执行，避开 DSH 启动高峰（MCP 连接、skill 加载）
    timer.setTimeout(function() {
      checkPluginUpdates().then(function(r) {
        console.log("AIX-WORK update check done: " + (r.ok ? (r.updateCount || 0) + " updates" : (r.permissionDenied ? "no permission" : r.message)));
      }).catch(function(e) { console.log("AIX-WORK update check error: " + String(e)); });
    }, 15000);
    return () => {
      for (let i = 0; i < toolDisposers.length; i++) { try { toolDisposers[i](); } catch {} }
      for (let j = 0; j < skillDisposers.length; j++) { try { skillDisposers[j](); } catch {} }
      for (const nm in state.mcpConnections) { if (state.mcpConnections[nm] && state.mcpConnections[nm].close) { try { state.mcpConnections[nm].close(); } catch {} } }
    };
  });
}

export { apply, inject, name };
