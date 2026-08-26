# DeepSeek Harness · 框架说明书

> 目的：让**新设备/新接手者**快速熟悉当前框架；**任何功能变更后，由 agent 按“维护规则”自动更新本文**（见文末）。
> 版本基准：`deepseek-harness` 源码克隆（`@deepseek-ai/dsh` rc.2 部署）· 完稿 2026-08-23

---

## 一、这是什么

DSH（DeepSeek Harness）= **本地智能体开发框架**：一个 Host 进程，为每个会话（Session）运行一个 Agent；Agent 拥有“预设（Preset）决定的工具集 + 人格提示词 + 技能（Skills）”，在“工作区（Workspace）”目录里干活，模型可选（默认 DeepSeek 路由）。

本机在官方框架之上，自研了 **IM 通道扩展 `dsh-channel-im`**：把钉钉/企业微信/微信群聊接进 DSH，让机器人/数字员工用同一套 Agent 能力交流。

## 二、架构速览

```
浏览器/聊天界面 ──► DSH Host (127.0.0.1:3080)
                     ├─ 会话 Session ── Agent（模型路由 + 工具 + 提示词 + 技能）
                     ├─ 工作区 Workspace（会话的 cwd/项目目录）
                     ├─ 预设 Preset（工具+人格+行为 组合：标准/极简/PTC/创造/机器人助手）
                     └─ 技能 Skills（~/.dsh/skills、~/.agents/skills、项目 .dsh/skills）

IM 通道扩展（dsh-channel-im / server.mjs 桥接，管理 API 5175）
  钉钉机器人(Stream) / 钉钉数字人(dws) / 企微智能机器人(长连接) / 微信群聊(Windows hook 网关)
        ▲▼ 消息
  会话自动创建/复用 → 回复回通道 → （专属工作区 / 按人命名 / 表情 等）
```

## 三、关键文件与目录

| 位置 | 说明 |
|---|---|
| `deepseek-harness/` | **DSH 官方源码克隆**（本机私有镜像；`git pull` 可跟上游） |
| `deepseek-harness/harness-说明书.md` | 本文 |
| `dsh-channel-im`（插件仓库） | **扩展唯一来源**：`git@github.com:772758976youxiang-lgtm/-.git`（桥接/扫码/连接页原生/外部打开/技能×2/预设/微信网关），`dsh plugin install` 安装 |
| `~/.dsh/` | 用户数据：技能、预设(`.agent-presets`)、工作区等 |
| `~/.dsh-im-channels.json` | IM 通道配置（唯一事实源；桥接持有；凭证在内，注意保密） |
| `~/.dsh-im-channels-status.json` | 桥接状态快照（「连接」页 5 秒轮询读取；只读勿手改） |
| `~/.dsh-im-bridge-map.json` | 会话映射（会话←→聊天窗口；自动维护） |

## 四、常用操作与端口

| 端口 | 服务 |
|---|---|
| **3080** | DSH Host / GUI（浏览器访问；/api RPC；本机 trust） |
| **5175** | 桥接管理 API（`GET/POST/DELETE /api/channels`） |
| 8788 / 8789 | 企微 / 微信 演示台 |
| 30001 | Windows 微信 hook 本机服务（仅 Windows） |

常用命令：
```bash
# DSH（在源码时代码目录）
cd deepseek-harness && pnpm install && pnpm dev        # 或 npm 安装版：npx dsh web
# 桥接
cd dsh-channel-im && node server.mjs                   # 通道自动连接（热加载配置）
# 钉钉数字人扫码
node ~/.dsh-channel-im/auth.mjs login   # 或插件包内 auth.mjs
# 看通道状态
curl -s http://127.0.0.1:5175/api/channels
# Windows 微信网关（Windows 机器）
python gateway.py                                      # 微信群聊 → harness
```

## 五、IM 通道现状（2026-08-23）

| 通道 | 类型 | 凭证/前置 | 现状 |
|---|---|---|---|
| 钉钉-小钉-机器人 | stream 机器人 | AppKey/AppSecret | ✅ 在线 |
| 钉钉-harness-测试机器人 | stream 机器人 | AppKey/AppSecret | ✅ 在线 |
| 钉钉-江俊-数字人 | dws 真人 | CLI 授权 + 扫码 | ✅ 在线（登录态 `dws auth`） |
| 企微智能机器人 | 长连接 | Bot ID/Secret | 🔧 演示台就绪，待凭证 |
| 微信群聊 | Windows hook | 微信4.1.10.27 + version.dll + 小号 | 🔧 网关+演示台就绪，待联调 |

**规则（写死技能，勿改）：**
- 命名：机器人 `钉钉-<名字>-机器人`；真人 `钉钉-<账号名>-数字人`；
- 每通道=独立工作区（`im-workspaces/<channelId>`，删了会自愈重建）；
- 真人=**必须扫码**（不复用）；删除=删配置+`dws auth logout`（下次需重扫）；
- 防互聊：`ignoreSenders`（如 `["harness"]`）与 `selfUserId`（数字人自环防护）。

## 六、「机器人助手」预设（机器人专用）

- 位置：`~/.dsh/.agent-presets/robot-assistant/`（源码副本在 `dsh-channel-im/presets/`）；
- **边界**：无 Shell/无后台任务/无子代理/无网页搜索 → 不能执行命令、不能联网、不能操控电脑；仅：工作区文件读写 + 文件检索 + 技能 + 记忆压缩；
- 人格要点：数字员工、中文、先结论、1–2 句、无表情、不暴露内部（不提工作区/目录/dingtalk-2）、不自称 AI 助手、不客服腔、不编造；
- **IM 通道默认预设 = `qiuzhu`（前台接待·仅求助）**（`DSH_AGENT_PRESET` 可覆盖；通道可配 `agentPreset` 单独指定）；「机器人助手」仍可用（会话创建时选）——若通道默认需改回其它预设，改 `server.mjs` 的 `AGENT_PRESET` 或设置环境变量；
- ⚠️ 修改预设的坑：**persona 文本每行必须缩进 6 空格**（顶格会被当新插件行 → `failed to mount`）；改完用 `agentPreset.list` 校验无 `broken`。

## 七、新设备 10 分钟上手（与本机功能一致）

> **一致性口径**：新设备 = **官方原版 harness + 插件** = 本机功能。插件仓库是唯一扩展来源；本机与插件之间的差异只剩「凭证/数据自理」。

1. Node ≥ 18；
2. **装官方原版 harness**：`npm i -g @deepseek-ai/dsh` → `npx dsh web`（3080；含官方全部功能：token 计量/峰谷/文件查看/中文界面）；
3. **装扩展插件（唯一一步，全功能）**：
   `dsh plugin --profile web install git+ssh://git@github.com:772758976youxiang-lgtm/-.git`
   （桥接/数字人扫码/「连接」页(原生)/「外部打开」/技能×2/「机器人助手」预设/微信网关 全自动；细节见插件 README/INSTALL/AGENTS.md）；
4. **凭证自理 4 项**：① DeepSeek API Key（设置→模型）② 钉钉机器人凭证 ③ 数字人扫码 ④ 微信小号+hook；
5. 验证：浏览器 3080 → 设置「连接」显示桥接状态；`npx dsh --profile headless "你好"`。

> 注：企微/微信通道当前为“调研+网关代码，桥接未接入”，本机与新设备**同此现状**（不构成差异）；需要时另行实现。

## 八、更新日志

| 日期 | 功能/变更 | 说明 |
|---|---|---|
| 2026-08-23 | IM 通道扩展 v0.1 `dsh-channel-im` | 桥接(stream+dws)、扫码自动注册、管理API、状态文件、工作区自愈、防互聊/防自环 |
| 2026-08-23 | 钉钉三通道上线 | 机器人×2 + 数字人×1（命名/工作区规则固化） |
| 2026-08-23 | 「连接」页 + 「外部打开」 | 源码化 + 幂等注入脚本（patch-settings/patch-conversation） |
| 2026-08-23 | 「机器人助手」预设 | 无命令/无联网能力边界 + 数字员工人格 |
| 2026-08-23 | 演示台×3 | 企微(8788)/微信(8789)/Windows 网关(gateway.py) |
| 2026-08-23 | 说明书 | 本文（含自动更新规则） |
| 2026-08-23 | 维护闭环升级 | 新功能必须源码入库+推送私人仓库+同步说明书；新设备完整性标准 |
| 2026-08-23 | 峰谷计费显示（周末全天谷价） | 状态栏峰/谷徽标（北京时间 9–12/14–18 为峰，周末全天谷）+ 上下文面板「账户余额」「本会话已用」费用行；费用按每请求实际发生时刻逐条计价（投影层持久估算，非当前时刻一刀切） |
| 2026-08-23 | 仓库定位确认 | 功能与本机一致、**凭证零入库**（API Key/通道凭证/登录态由新设备重新配置，均有引导流程） |
| 2026-08-23 | 新机自动补齐 | 仓库根 postinstall → auto-install.mjs（跨平台）：桥接/技能/预设自动装；官方npm版自动注入连接页/外部打开 |
| 2026-08-23 | 一致性口径定稿 | 新设备=官方原版harness+插件(`-`仓库)=本机；插件=唯一扩展源；凭证/数据自理；企微/微信为待实现现状（两边一致） |
| 2026-08-23 | IM 默认预设切换 | 桥接默认 `robot-assistant` → `qiuzhu`（前台接待·仅求助）；每通道可覆盖 |

## 九、维护规则（agent 必读，自动更新）

**每次对本框架/IM 通道的“功能新增或变更”后，必须完成“完整闭环”，缺一不可：**

1. **写进源码**：新功能/更新必须落在源码仓库——`deepseek-harness`（本体，改 `packages/`）或 `dsh-channel-im`（扩展）。**禁止**只存在于本机运行时（例如 node_modules 手工补丁必须同步为源码 + 注入脚本/install 步骤）。
2. **推送仓库**：功能完成后 `git add -A && git commit && git push`（两个仓库各自推送；`deepseek-harness` 推用户**私人镜像远端**，不要推官方上游；`dsh-channel-im` 同样推送私人仓库）。**推送后仓库 = 当前完整功能**。
3. **同步更新本说明书**：
   - 在「八、更新日志」**追加一行**（日期 | 功能/变更 | 一句话说明）；
   - 若涉及：新组件/端口/命令/配置文件 → 同步改「三/四/五」对应表格；
   - 若涉及：新预设/权限边界/规则 → 同步改「六」；
   - 保持“**新设备照着本文第 7 节即可跑通**”的承诺。
4. **新设备完整性标准**：以“新设备 clone + install.sh 后，**无需任何额外手工操作**即可复现全部功能”为验收线；宁可说明书多写一步，不留“本地才知道”的隐性步骤。
5. 完成第 1–4 步后端回复里声明：“已完成：源码入库 ✅ / 推送 ✅ / 说明书已同步更新 ✅”。

（配套技能：`harness-docs`，加载后按上述规则执行。）
