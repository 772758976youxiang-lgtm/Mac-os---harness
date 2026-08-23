# dsh-channel-im — DSH 钉钉通道扩展（机器人模式 + 真人模式）

把钉钉通道能力接入 DeepSeek Harness 的正式源码包：**可提交到私有仓库，任何 DSH 部署安装即可用**。

## 能力

| 模式 | 说明 |
|---|---|
| `stream` 机器人 | 钉钉机器人（AppKey/AppSecret），SDK 长连，多机器人并行 |
| `dws` 真人 | 官方 DWS CLI 的真实钉钉账号（如“江俊”），以**账号本人身份**收发；**每通道一个账号（`--profile`），多真人可同时在线**；扫码登录即用 |

公共能力：会话按人/窗口自动建档复用、按人名命名、专属工作区、归档感知、去重/ACK、看门狗、状态文件（供「连接」页 5 秒轮询显示）、管理 API（增删机器人/查看状态）。

## 文件

| 文件 | 作用 |
|---|---|
| `server.mjs` | 桥接：读取 `~/.dsh-im-channels.json`，按 `mode` 连接（stream SDK / dws 监听），管理API `5175`，热加载 |
| `auth.mjs` | 扫码登录助手：`node auth.mjs login`（设备流，打印授权 URL+user_code，轮询 profile 直到成功）；`node auth.mjs status` |
| `skills/im-channel-setup.md` | agent 技能：先问模式；真人模式=扫码接入流程 |
| `install.sh` | 一键接入当前 DSH 部署（拷贝服务、装技能、注入「连接」页） |
| `client/connection-page.js` | 「连接」设置页组件**源码**（可读参考版：5 秒轮询桥接状态） |
| `client/connection.compiled.js` | 上述组件的编译形态（供注入脚本使用） |
| `client/patch-settings.mjs` | 连接页**注入脚本**（幂等：locale+组件+注册；在其它 DSH 安装上执行即可获得「连接」页） |
| `client/open-external.js` | 「外部打开」按钮**源码**（会话详情面板：点击在系统文件管理器中打开文件） |
| `client/open-external.compiled.js` | 该按钮编译形态（供注入脚本使用） |
| `client/patch-conversation.mjs` | 「外部打开」**注入脚本**（幂等：locale+按钮） |

## 快速开始（任何机器）

```bash
# 0) 前置：Node ≥18；真人模式另需 dws CLI（见 install.sh 内说明）+ 管理员开 CLI 权限并把账号加入授权名单
bash install.sh                # 拷贝到 ~/.dsh-channel-im + 安装技能
cd ~/.dsh-channel-im
node server.mjs                # 管理API http://127.0.0.1:5175
```

### 接入机器人（对话式，agent 用技能自动完成）
- “我想连接钉钉” → agent 问模式 → 机器人模式给你要凭证；真人模式跑 `node auth.mjs login` 把授权 URL 发你扫码 → 自动写配置、起监听 → 即可用。

### 配置格式（`~/.dsh-im-channels.json`）
```json
{
  "channels": [
    { "id": "dingtalk-1", "platform": "dingtalk", "name": "钉钉-小钉", "mode": "stream", "appKey": "ding…", "appSecret": "…", "enabled": true },
    { "id": "dingtalk-person", "platform": "dingtalk", "name": "钉钉-江俊(真人)", "mode": "dws", "profile": "ding193e4e…:040640486858880459", "ignoreSenders": ["harness"], "enabled": true }
  ]
}
```

## 常驻运行（生产示例）

```bash
# systemd（Linux）
[Unit] Description=dsh-channel-im
[Service] ExecStart=/usr/bin/node /home/user/.dsh-channel-im/server.mjs
Restart=always
# pm2（跨平台）
pm2 start server.mjs --name dsh-channel-im --time && pm2 save
```

## 「连接」设置页

设置页“连接”（外部连接）读取桥接写的 `~/.dsh-im-channels-status.json`（每 5 秒）展示在线通道。
> 说明：当前该页组件为最小实现，挂载方式见 `client/connection-page.js`（在 DSH 的 ui-settings-general bundle 中注册 `settings.section`；正式化时可做成独立 client-ui 插件）。

## 安全提示

- 服务只监听 `127.0.0.1`；dws/机器人凭证为敏感信息，配置权限 0600；
- 真人账号为“人身份 AI 值守”，对外使用请按组织合规标注“AI 数字员工”并审计；
- 防互聊：其它机器人/自动化账号加入 `ignoreSenders`。
