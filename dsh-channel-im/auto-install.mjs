#!/usr/bin/env node
/**
 * dsh-channel-im · 自动补齐安装（跨平台，Node ≥18，Windows/macOS/Linux 通用）
 *
 * 作用：把本机扩展一次性装好——
 *   1) 桥接/扫码 → ~/.dsh-channel-im（含依赖）
 *   2) 技能 → ~/.dsh/skills、~/.agents/skills
 *   3) 「机器人助手」预设 → ~/.dsh/.agent-presets/robot-assistant
 *   4) 「连接」页 + 「外部打开」补丁 → 官方 npm 版 DSH 的已装 bundle（幂等）
 *
 * 触发方式：
 *   - 源码构建：仓库根 `pnpm install` 时由 postinstall 自动调用；
 *   - 官方 npm 版：手动 `node dsh-channel-im/auto-install.mjs` 一步补齐。
 * 凭证（API Key/通道/登录态）一律不在本脚本范围——新设备按引导自配。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const DEST = path.join(HOME, ".dsh-channel-im");
const DSH = path.join(HOME, ".dsh");
const done = [];
const warn = [];

const log = (m) => console.log(`  ${m}`);
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };

try {
  // 1) 桥接与扫码
  fs.mkdirSync(DEST, { recursive: true });
  cp(path.join(HERE, "server.mjs"), path.join(DEST, "server.mjs"));
  cp(path.join(HERE, "auth.mjs"), path.join(DEST, "auth.mjs"));
  if (!fs.existsSync(path.join(DEST, "package.json"))) cp(path.join(HERE, "package.json"), path.join(DEST, "package.json"));
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  if (!fs.existsSync(path.join(DEST, "node_modules"))) {
    const r = spawnSync(npmCmd, ["install", "--no-audit", "--no-fund"], { cwd: DEST, stdio: "ignore", shell: process.platform === "win32" });
    if (r.status !== 0) warn.push("桥接依赖安装失败（可稍后 cd ~/.dsh-channel-im && npm install）");
  }
  done.push("桥接/扫码 → ~/.dsh-channel-im");

  // 2) 技能
  for (const [srcName, dstName] of [["im-channel-setup.md", "im-channel-setup.md"], ["harness-docs-update.md", "harness-docs.md"]]) {
    const src = path.join(HERE, "skills", srcName);
    if (fs.existsSync(src)) {
      cp(src, path.join(DSH, "skills", dstName));
      cp(src, path.join(HOME, ".agents", "skills", dstName));
    }
  }
  done.push("技能×2 → ~/.dsh/skills、~/.agents/skills");

  // 3) 预设
  cp(path.join(HERE, "presets", "robot-assistant", "preset.yml"), path.join(DSH, ".agent-presets", "robot-assistant", "preset.yml"));
  cp(path.join(HERE, "presets", "robot-assistant", "agent.cordis.yml"), path.join(DSH, ".agent-presets", "robot-assistant", "agent.cordis.yml"));
  done.push("「机器人助手」预设");

  // 4) 连接页/外部打开补丁（仅对“真包”生效；源码构建的软链会跳过并提示）
  const settingsBundle = path.join(HERE, "..", "node_modules", "@deepseek-ai", "dsh-client-ui-settings-general", "lib", "client.js");
  const convBundle = path.join(HERE, "..", "node_modules", "@deepseek-ai", "dsh-client-ui-conversation", "lib", "client.js");
  const runPatch = (script, target) => {
    const r = spawnSync(process.execPath, [path.join(HERE, "client", script), target], { stdio: "inherit" });
    return r.status === 0;
  };
  if (fs.existsSync(settingsBundle)) {
    if (runPatch("patch-settings.mjs", settingsBundle)) done.push("「连接」页补丁"); else warn.push("「连接」页补丁失败（源码构建版请用官方 npm 版，或改源码实现）");
  } else {
    warn.push("未找到 DSH 设置包（源码构建版）：「连接」页跳过——源码构建下的完整方案后续将改源码实现");
  }
  if (fs.existsSync(convBundle)) {
    if (runPatch("patch-conversation.mjs", convBundle)) done.push("「外部打开」补丁"); else warn.push("「外部打开」补丁失败");
  } else {
    warn.push("未找到 DSH 会话包（源码构建版）：「外部打开」跳过");
  }

  console.log("\n✅ dsh-channel-im 自动补齐完成：");
  for (const d of done) log("✓ " + d);
  if (warn.length) { console.log("⚠️ 提示："); for (const w of warn) log("• " + w); }
  if (fs.existsSync(settingsBundle)) {
    console.log("\n下一步（凭证自理）：设置→模型 填 DeepSeek API Key；启动桥接：");
    console.log(`  node ${path.join(DEST, "server.mjs")}`);
  }
} catch (e) {
  console.error("自动补齐失败：", e?.message ?? e);
  process.exit(1);
}
