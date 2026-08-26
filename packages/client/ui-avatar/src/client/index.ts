/**
 * Avatar plugin, browser half: the `conversation.avatar` occupant. One
 * shared `avatar` settings scope backs every surface — the user's own disc
 * and every agent's disc read the same snapshot, and the picker writes route
 * through the scope's serialized path (a remote browser's choices stay
 * process-local through the scope's memory mode).
 * @module @deepseek-ai/dsh-client-ui-avatar/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the conversation.avatar entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings plugin's Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AvatarSettingsStore } from './avatar-store.ts'
import { decodeAvatarSection } from './avatar-spec.ts'
import { AvatarSurface } from './AvatarSurface.tsx'
import type { AvatarInjected } from './slots.ts'
import { en, zh } from './locales.ts'

export type { AvatarInjected, AvatarSaveHandler, AvatarSurfaceProps } from './slots.ts'
export type {
  AvatarSettingsSection, AvatarSide, AvatarSpec, EmojiAvatarSpec, ImageAvatarSpec,
} from './avatar-spec.ts'
export type { AvatarSettingsState } from './avatar-store.ts'
export { AvatarSettingsStore } from './avatar-store.ts'
export type { AvatarKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'avatar'

/** Durable settings namespace carrying every avatar choice. */
export const AVATAR_SETTINGS_NAMESPACE = 'avatar'

/** Required services: the slot registry, the locale seat, and the settings scope. */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Client plugin body: bind the avatar settings scope and register the
 * conversation avatar surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-avatar: dictionaries')

  const store = new AvatarSettingsStore(ctx.settingsScope.bind({
    namespace: AVATAR_SETTINGS_NAMESPACE,
    decode: decodeAvatarSection,
  }))

  ctx.slots.inject('conversation.avatar', () => ctx.slots.register({
    name: 'conversation.avatar',
    locale: NS,
    inject: (): AvatarInjected => ({
      hooks: { avatar: store.store },
      controller: store,
    }),
  }, AvatarSurface))

  ctx.effect(() => () => { store.dispose() }, 'ui-avatar: settings store')
}
