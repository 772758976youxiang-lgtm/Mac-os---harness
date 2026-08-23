// 企业微信智能机器人 · 长连接演示台（官方 @wecom/aibot-node-sdk）
// 用法：node server.js   → http://127.0.0.1:8788 （浏览器演示台）
// 配置：同目录 config.json（botId/secret/agent 模式）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AiBot from "@wecom/aibot-node-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8788);
const CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULTS = {
  botId: "", secret: "", address: undefined,
  agent: { mode: "echo", openai: { baseUrl: "", apiKey: "", model: "qwen-plus" }, customUrl: "" },
  auto: { enabled: true, minIntervalMs: 3000 },
};
let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; } catch {}

const NOW = () => new Date().toISOString().slice(11, 19);
const log = (...a) => { const line = `[${NOW()}] ${a.join(" ")}`; console.log(line); push("log", { line }); };

// ---------- SSE ----------
const clients = new Set();
function push(type, payload) {
  const data = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const res of clients) try { res.write(data); } catch {}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 消息处理（去重 + 队列 + 最小间隔） ----------
const seen = new Set();
const queue = [];
let busy = false, lastReplyAt = 0;
function dedupe(frame) {
  const id = frame?.req_id || frame?.body?.req_id || JSON.stringify(frame?.body || {}).slice(0, 60);
  if (seen.has(id)) { log("重投跳过", id); return false; }
  seen.add(id);
  if (seen.size > 500) seen.delete(seen.values().next().value);
  return true;
}
function enqueue(frame) { queue.push(frame); if (!busy) worker(); }
async function worker() {
  busy = true;
  while (queue.length) {
    const wait = lastReplyAt + cfg.auto.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    const frame = queue.shift();
    try {
      const text = await callAgent(frame);
      if (text) await reply(frame, text);
      lastReplyAt = Date.now();
    } catch (e) { log("回复失败:", e.message); }
  }
  busy = false;
}
async function reply(frame, text) {
  const sid = AiBot.generateReqId("stream");
  try {
    await wsClient.replyStream(frame, sid, text, true);
    log("已回复:", String(text).slice(0, 60));
  } catch (e) { log("replyStream 失败:", e.message); }
}

// ---------- Agent（echo / openai兼容 / custom HTTP） ----------
async function callAgent(frame) {
  const content = frame?.body?.text?.content || "";
  const mode = cfg.agent.mode;
  if (mode === "echo") return `echo: ${content}`;
  if (mode === "openai") {
    const { baseUrl, apiKey, model } = cfg.agent.openai;
    if (!baseUrl) throw new Error("未配置 openai.baseUrl");
    const r = await fetch(baseUrl, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], stream: false }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? "";
  }
  if (mode === "custom") {
    if (!cfg.agent.customUrl) throw new Error("未配置 customUrl");
    const r = await fetch(cfg.agent.customUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: frame, content, req_id: frame?.req_id }),
    });
    const j = await r.json().catch(() => ({}));
    return j?.reply ?? j?.answer ?? j?.message ?? j?.text ?? j?.content ?? j?.output ?? "";
  }
  return "";
}

// ---------- 长连接监听 ----------
let wsClient = null;
const status = { connected: false, authenticated: false, address: "" };
function start() {
  if (!cfg.botId || !cfg.secret) { log("未配置 botId/secret，请编辑 config.json"); return; }
  wsClient = new AiBot.WSClient({ botId: cfg.botId, secret: cfg.secret, ...(cfg.address ? { address: cfg.address } : {}) });
  for (const ev of ["message.text", "message.image", "message.mixed", "message.voice", "message.file", "event.enter_chat", "event.template_card_event"]) {
    wsClient.on(ev, (frame) => {
      if (!dedupe(frame)) return;
      log(`[收到] ${ev}`, frame?.body?.text?.content ?? frame?.body?.image?.url ?? frame?.body?.event?.event?.type ?? "");
      push("msg", { ev, frame, time: NOW() });
      if (cfg.auto.enabled && ev.startsWith("message.")) enqueue(frame);
      if (ev === "event.enter_chat") {
        wsClient.replyWelcome(frame, { msgtype: "text", text: { content: "你好！我是 AI 助手，有什么可以帮你？" } }).catch(() => {});
      }
    });
  }
  wsClient.on("authenticated", () => { status.authenticated = true; log("✅ 认证成功（Subscribe success）"); push("status", status); });
  wsClient.on("disconnected", (e) => { status.authenticated = false; log("连接断开", e?.message ?? ""); push("status", status); });
  wsClient.on("error", (e) => log("错误:", e?.message ?? e));
  wsClient.connect();
  status.connected = true;
  push("status", status);
}

// ---------- HTTP ----------
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
  }
  if (req.method === "GET" && u.pathname === "/api/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(":ok\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.method === "GET" && u.pathname === "/api/status") return send(200, { ok: true, botId: cfg.botId, ...status });
  if (req.method === "POST" && u.pathname === "/api/config") {
    let body = ""; req.on("data", (d) => body += d); req.on("end", () => {
      try { cfg.agent = { ...cfg.agent, ...(JSON.parse(body || "{}").agent ?? {}) }; fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); send(200, { ok: true, agent: cfg.agent }); }
      catch (e) { send(400, { ok: false, error: e.message }); }
    }); return;
  }
  if (req.method === "POST" && u.pathname === "/api/send") {
    let body = ""; req.on("data", (d) => body += d); req.on("end", async () => {
      try {
        const { userid, text } = JSON.parse(body || "{}");
        if (!wsClient || !status.authenticated) return send(400, { ok: false, error: "未认证" });
        await wsClient.sendMessage(userid, { msgtype: "markdown", markdown: { content: text } });
        send(200, { ok: true });
      } catch (e) { send(400, { ok: false, error: e.message }); }
    }); return;
  }
  send(404, { error: "not found" });
});
server.listen(PORT, () => log(`演示台: http://127.0.0.1:${PORT}`));

start();
process.on("SIGINT", () => { try { wsClient?.disconnect?.(); } catch {} process.exit(0); });
