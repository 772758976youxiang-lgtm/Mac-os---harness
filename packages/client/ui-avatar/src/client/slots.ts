/**
 * The avatar entry's injected face: the shared settings store (bound as the
 * `useAvatar` hook) plus the write verbs behind the picker.
 * @module @deepseek-ai/dsh-client-ui-avatar/client/slots
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-conversation's SlotMap merge (the conversation.avatar entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'avatar' seat).
import type {} from './locales.ts'
import type { AvatarSettingsState, AvatarSettingsStore } from './avatar-store.ts'
import type { AvatarSpec } from './avatar-spec.ts'

/** Injected business face of one avatar surface. */
export interface AvatarInjected {
  hooks: {
    /** The shared avatar settings snapshot. */
    avatar: SnapshotStore<AvatarSettingsState>
  }
  /** Write verbs behind the picker. */
  controller: AvatarSettingsStore
}

/** Full props of one conversation avatar surface. */
export type AvatarSurfaceProps =
  PropsRuntime<'conversation.avatar'>
  & InjectFace<AvatarInjected>
  & PropsLocale<'avatar'>

/** Save callback contract shared with the picker. */
export type AvatarSaveHandler = (spec: AvatarSpec | null) => Promise<boolean>
