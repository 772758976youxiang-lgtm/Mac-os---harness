// 微信（个人号）群聊机器人演示台 · Wechaty + PadLocal（iPad 协议）
// 用法：node server.js → http://127.0.0.1:8789
// 前置：config.json 填 padlocalToken（padlocal.com 购买）+ 微信小号扫码登录
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import { WechatyBuilder } from "wechaty";
import { PuppetPadlocal } from "wechaty-puppet-padlocal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8789);
const CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULTS = {
  padlocalToken: "",
  agent: { mode: "echo", openai: { baseUrl: "", apiKey: "", model: "qwen-plus" }, customUrl: "" },
  auto: { enabled: true, minIntervalMs: 3000, roomPolicy: "at" }, // 群: at=只回@我 all=全回 off=不回
};
let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; } catch {}

const NOW = () => new Date().toISOString().slice(11, 19);
const log = (...a) => { const line = `[${NOW()}] ${a.join(" ")}`; console.log(line); push("log", { line }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- SSE ----------
const clients = new Set();
function push(type, payload) { const data = `data: ${JSON.stringify({ type, ...payload })}\n\n`; for (const res of clients) try { res.write(data); } catch {} }

// ---------- 队列/去重/最小间隔 ----------
const seen = new Set();
const queue = [];
let busy = false, lastReplyAt = 0;
function enqueue(item) { queue.push(item); if (!busy) worker(); }
async function worker() {
  busy = true;
  while (queue.length) {
    const wait = lastReplyAt + cfg.auto.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    const { msg, replyTo } = queue.shift();
    try {
      const text = await callAgent(msg);
      if (text) { await replyTo(text); lastReplyAt = Date.now(); log("已回复:", String(text).slice(0, 60)); }
    } catch (e) { log("回复失败:", e.message); }
  }
  busy = false;
}

// ---------- Agent（echo / openai兼容 / custom） ----------
async function callAgent(msg) {
  const content = msg.text();
  const mode = cfg.agent.mode;
  if (mode === "echo") return `echo: ${content}`;
  if (mode === "openai") {
    const { baseUrl, apiKey, model } = cfg.agent.openai;
    if (!baseUrl) throw new Error("未配置 openai.baseUrl");
    const r = await fetch(baseUrl, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: "你是微信群里的 AI 助手" }, { role: "user", content }], stream: false }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? "";
  }
  if (mode === "custom") {
    if (!cfg.agent.customUrl) throw new Error("未配置 customUrl");
    const r = await fetch(cfg.agent.customUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_id: msg.id, room: msg.room() ? String(await msg.room().title()) : "", talker: String(await msg.talker().name()), content, type: msg.type() }),
    });
    const j = await r.json().catch(() => ({}));
    return j?.reply ?? j?.answer ?? j?.message ?? j?.text ?? j?.content ?? j?.output ?? "";
  }
  return "";
}

// ---------- Wechaty ----------
let bot = null;
const status = { connected: false, loginName: "", scanning: false };
function start() {
  if (!cfg.padlocalToken) { log("未配置 padlocalToken（padlocal.com 购买），请编辑 config.json"); return; }
  bot = WechatyBuilder.build({ name: "wechat-demo", puppet: new PuppetPadlocal({ token: cfg.padlocalToken }) });
  bot.on("scan", (url, code) => {
    status.scanning = true; push("status", status);
    qrcode.generate(url, { small: true }); log("请扫码登录（二维码已打印）");
    push("scan", { url, code });
  });
  bot.on("login", (user) => { status.connected = true; status.loginName = user.name(); status.scanning = false; log("✅ 登录:", user.name()); push("status", status); });
  bot.on("logout", () => { status.connected = false; log("已退出登录"); push("status", status); });
  bot.on("error", (e) => log("错误:", e?.message ?? e));
  bot.on("message", async (msg) => {
    try {
      if (msg.self()) return;                            // 自己不回
      const id = msg.id || `${Date.now()}`;
      if (seen.has(id)) { log("重投跳过", id); return; }
      seen.add(id); if (seen.size > 800) seen.delete(seen.values().next().value);
      const room = msg.room();
      const talker = msg.talker();
      const content = msg.text() || "";
      const isRoom = !!room;
      const roomTitle = isRoom ? String(await room.title()) : "";
      push("msg", { ev: isRoom ? `群聊:${roomTitle}` : "单聊", talker: String(await talker.name()), content, type: msg.type(), id, time: NOW() });
      if (!cfg.auto.enabled) return;
      // 群策略：at=只回@我 all=全回 off=不回
      if (isRoom && cfg.auto.roomPolicy === "off") return;
      if (isRoom && cfg.auto.roomPolicy === "at") {
        let atMe = false;
        try { atMe = await msg.mentionSelf(); } catch { atMe = content.includes("@" + status.loginName); }
        if (!atMe) return;
      }
      enqueue({ msg, replyTo: async (text) => isRoom ? room.say(text) : talker.say(text) });
    } catch (e) { log("消息处理失败:", e.message); }
  });
  bot.start().catch((e) => log("启动失败:", e?.message ?? e));
}
start();

// ---------- HTTP ----------
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(fs.readFileSync(path.join(__dirname, "index.html"))); }
  if (req.method === "GET" && u.pathname === "/api/stream") { res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); res.write(":ok\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return; }
  if (req.method === "GET" && u.pathname === "/api/status") return send(200, { ok: true, ...status, padlocalToken: cfg.padlocalToken ? "已配置" : "" });
  if (req.method === "POST" && u.pathname === "/api/incoming") {
    let body = ""; req.on("data", (d) => body += d); req.on("end", async () => {
      try {
        const m = JSON.parse(body || "{}");
        push("msg", { ev: m.room_id ? `群聊:${m.room_name || m.room_id}` : "单聊", talker: m.talker || "", content: m.content || "", type: 1, id: m.msg_id || "", time: NOW() });
        let reply = "";
        if (cfg.auto.enabled && (m.room_id ? cfg.auto.roomPolicy === "all" || (cfg.auto.roomPolicy === "at" && (m.at_me ?? true)) : true)) {
          const fake = { id: m.msg_id || "", text: () => m.content || "", type: () => 1, room: () => (m.room_id ? { } : null), talker: () => ({ name: async () => m.talker || "" }) };
          reply = await callAgent(fake);
          if (reply) log("已回复(网关):", String(reply).slice(0, 60));
        }
        send(200, { ok: true, reply });
      } catch (e) { send(400, { ok: false, error: e.message }); }
    }); return;
  }
  if (req.method === "POST" && u.pathname === "/api/config") {
    let body = ""; req.on("data", (d) => body += d); req.on("end", () => {
      try { cfg.agent = { ...cfg.agent, ...(JSON.parse(body || "{}").agent ?? {}) }; cfg.auto = { ...cfg.auto, ...(JSON.parse(body || "{}").auto ?? {}) }; fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); send(200, { ok: true }); }
      catch (e) { send(400, { ok: false, error: e.message }); }
    }); return;
  }
  if (req.method === "POST" && u.pathname === "/api/say") {
    let body = ""; req.on("data", (d) => body += d); req.on("end", async () => {
      try {
        const { kind, id, text } = JSON.parse(body || "{}");
        if (!bot) return send(400, { ok: false, error: "机器人未登录" });
        if (kind === "room") { const room = await bot.Room.find({ id }); if (!room) return send(400, { ok: false, error: "群不存在" }); await room.say(text); }
        else { const c = await bot.Contact.find({ id }); if (!c) return send(400, { ok: false, error: "联系人不存在" }); await c.say(text); }
        send(200, { ok: true });
      } catch (e) { send(400, { ok: false, error: e.message }); }
    }); return;
  }
  send(404, { error: "not found" });
});
server.listen(PORT, () => log(`演示台: http://127.0.0.1:${PORT}`));
process.on("SIGINT", () => { try { bot?.stop?.(); } catch {} process.exit(0); });
