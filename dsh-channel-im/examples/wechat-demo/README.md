# 微信群聊机器人演示台（Wechaty + PadLocal）

> ⚠️ 非官方协议（iPad 协议），违反微信服务协议，**封号风险自担**。请务必使用**微信小号**，勿用主号。

## 1. 准备

| 项 | 说明 | 在哪拿 |
|---|---|---|
| **微信小号** | 专门跑机器人、可接受封号的微信号（准备好可扫码登录） | 微信注册即可 |
| **PadLocal Token** | iPad 协议服务使用权（**付费**，按时间购买） | **padlocal.com** 官网购买（充值/扫码后获得 token） |
| Node ≥ 18 | 运行环境 | 本机已具备 |

## 2. 运行

```bash
cd dsh-channel-im/examples/wechat-demo
npm install                    # 已装可跳过
# 编辑 config.json：填 padlocalToken；agent.mode 可选 echo/openai/custom；auto.roomPolicy 群聊策略
node server.js                 # → http://127.0.0.1:8789
```

浏览器打开演示台：
1. 出现**二维码**（或用微信小号扫码登录）→ 状态变“✅ 在线”；
2. 在小号所在的微信群里 **@机器人**（或单聊）→ 消息流实时显示 → 自动回复（默认 echo）。

## 3. 功能

| 功能 | 说明 |
|---|---|
| 登录 | PadLocal 扫码登录，状态实时展示 |
| 群聊 | 策略可选：**只回@我** / 所有消息 / 不回群 |
| 单聊 | 自动回复 |
| 自动回复 | echo / openai 兼容 / custom HTTP（对接 harness/现有 agent） |
| 发送测试 | 面板按 群/联系人 id 主动发消息 |
| 实时 | SSE 消息流 + 运行日志 |

## 4. 风险与控制

- **封号风险**：小号被封 → 换新小号重登即可（PadLocal token 可继续用）；
- 建议控制：回复频率（minIntervalMs）、只在必要群@应答、避免营销/加人行为；
- 正式接入 harness 后（功能开发阶段），加：敏感词/白名单、审计、人工兜底。
