# 企业微信智能机器人 · 长连接演示台

验证企业微信「智能机器人（API 模式·长连接）」通道：连接 → 收消息 → 自动回复，浏览器实时查看。

## 1. 准备（企业微信侧）

1. 注册/登录**企业微信**（个人可注册，未认证受限；建议公司或认证版）；
2. 创建智能机器人：
   - 企业微信客户端：**工作台 → 智能机器人 → 创建机器人 → 手动创建 → API 模式创建**；
   - 或 管理后台 `work.weixin.qq.com` → 应用管理 → 智能机器人 → 创建；
3. 填：**名称**（如“企微-小助手”）、头像、**可见范围**（包含你自己/测试同事）；
4. 接入方式选 **「长连接模式」**（勿选 URL 回调——需公网）；
5. 记下 **Bot ID** 与 **Secret**。

## 2. 运行

```bash
cd dsh-channel-im/examples/wecom-demo
# 编辑 config.json 填入 botId / secret（agent.mode 可选 echo/openai/custom）
npm install        # 已装可跳过
node server.js     # → http://127.0.0.1:8788
```

浏览器打开演示台：状态“✅ 已认证”后，在企业微信里单聊机器人（或群里 @它）→ 消息流出现 + 自动回复（默认 echo）。

## 3. 功能

| 功能 | 说明 |
|---|---|
| 长连接 | 官方 SDK（`@wecom/aibot-node-sdk`），自动认证/心跳/避退重连 |
| 消息 | text/image/mixed/voice/file 事件全部广播；enter_chat 自动欢迎语 |
| 自动回复 | echo / openai 兼容 / custom HTTP（对接现有 agent）三模式 |
| 主动推送 | `sendMessage(userid, markdown)`（演示台按钮） |
| 原始帧 | 演示台可切换查看完整消息结构 |

> 注：图片/文件消息演示台先广播展示；下载解密（`downloadFile(url,aeskey)`）与媒体回复（上传+replyMedia）留待正式功能开发接入。
