# @deepseek-ai/dsh-client-ui-avatar

English | [中文](README.zh.md)

Chat avatar plugin, browser half: the `conversation.avatar` row seat declared by `ui-conversation`'s chat view. One occupant renders both sides of the conversation — the user's disc beside every user/steering bubble (right side, chat convention for own messages) and the agent's disc beside every assistant narration (left side). Clicking either disc opens the change-avatar picker: upload an image (cover-cropped and downscaled to 96×96 PNG in the browser), pick an emoji tile with an optional background hue, or reset to the deterministic default. The default disc needs no stored state: the user side gets a fixed blue disc with a localized "Me" initial, and every agent gets a stable hue hashed from its session id plus the first character of its display title, so each agent is visually distinct the moment it appears.

Choices persist in the durable `avatar` settings namespace (`user` field + `agents` map keyed by session id), registered by this package's node half through the settings seam. Every surface reads one shared browser store over the namespace scope, so a change anywhere updates every row immediately, and a remote browser's choices stay process-local through the scope's memory mode. Uploaded images are capped at 96 KiB of data URL after compression to keep the settings document small.

The `/client` exports are the plugin body (`apply`/`inject`), the `AvatarSurface` component, the `AvatarSettingsStore`, the injected face types, and the avatar domain types.

## Model Experience

None, as avatars are presentation state stored in the settings document; no avatar data enters the append-only Session log, the model context, or telemetry.

#### KV Cache effect

None; no avatar mutation touches the history tail.

## Known Limitations and Deferred Work

- **Chat rows only** — the avatar seat is declared by the chat view entry, so discs render in the conversation flow but not in the session list or the session header; those surfaces would need their own slot declarations (a slot can only be declared by one entry).
- **Image avatars are PNG-only after import** — the crop pipeline re-encodes every upload (including animated formats) as a single static 96×96 PNG frame.
- **Write failures surface in the picker only** — a refused settings write shows an inline error in the open picker; a closed picker cannot announce a background failure.
