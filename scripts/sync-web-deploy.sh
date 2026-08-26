#!/usr/bin/env bash
# 将 deepseek-harness 检出中构建好的 Web 产物同步到本机运行中的部署
# (/Users/Admin/DeepSeek/node_modules/@deepseek-ai/*)，使 `dsh web`(3080)
# 立即生效。幂等：仅覆盖本次头像功能涉及的包。
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY=/Users/Admin/DeepSeek/node_modules/@deepseek-ai

sync_pkg() {
  local name="$1"
  local src="$REPO/packages/$2"
  local dst="$DEPLOY/$name"
  mkdir -p "$dst/lib"
  for f in index.js invariant.js client.js; do
    if [ -f "$src/lib/$f" ]; then cp "$src/lib/$f" "$dst/lib/$f"; fi
  done
  rm -rf "$dst/lib/types"
  if [ -d "$src/lib/types" ]; then cp -R "$src/lib/types" "$dst/lib/types"; fi
  echo "synced $name"
}

# 新包：整包复制（package.json + lib）
mkdir -p "$DEPLOY/dsh-client-ui-avatar"
cp "$REPO/packages/client/ui-avatar/package.json" "$DEPLOY/dsh-client-ui-avatar/package.json"
sync_pkg dsh-client-ui-avatar client/ui-avatar

# 改动包：ui-conversation（行内头像 seat）
sync_pkg dsh-client-ui-conversation client/ui-conversation

# web shell dist
rm -rf "$DEPLOY/dsh-web-frontend/dist"
cp -R "$REPO/apps/web/dist" "$DEPLOY/dsh-web-frontend/dist"
echo "synced dsh-web-frontend/dist"

# web-app roster：本机不再复制 bundle patch —— ui-avatar 行由用户 patch 层
# (~/.dsh/profiles/web/cordis.patch.yml，config-only HMR 热加载) 提供，避免与
# bundle 行重复导致 duplicate loader entry id。源码仓库的 bundle patch 保留该行
# 供上游构建使用。
# 新包 profile 软链（解析锚点 ~/.dsh/profiles/node_modules）
ln -sfn "$DEPLOY/dsh-client-ui-avatar" /Users/Admin/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-avatar
echo "linked dsh-client-ui-avatar into profile"
