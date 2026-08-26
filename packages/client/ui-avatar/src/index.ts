/**
 * Avatar surface plugin, node half: registers the durable `avatar` settings
 * namespace so the browser half's writes have a host schema to resolve
 * against. The browser half ships via exports["./client"], discovered through
 * the package.json dsh.client declaration.
 * @module @deepseek-ai/dsh-client-ui-avatar
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Durable settings namespace for chat avatar choices. */
export const AVATAR_SETTINGS_NAMESPACE = 'avatar'

/** Schema of one avatar choice (mirrors the browser-side spec union). */
const AvatarSpecSchema = z.union([
  z.object({
    kind: z.const('image').required(),
    dataUrl: z.string().required(),
  }),
  z.object({
    kind: z.const('emoji').required(),
    emoji: z.string().required(),
    background: z.string(),
  }),
])

/** Schema of the whole avatar section: the user avatar plus per-agent overrides. */
const AvatarSettingsSchema = z.object({
  user: AvatarSpecSchema,
  agents: z.dict(AvatarSpecSchema),
})

/**
 * Register the avatar section when a settings provider exists.
 * @param ctx - host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(AVATAR_SETTINGS_NAMESPACE),
      AvatarSettingsSchema,
    )
  })
}
