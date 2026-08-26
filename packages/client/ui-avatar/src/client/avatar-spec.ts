/**
 * Avatar domain model: the durable spec union stored in the `avatar` settings
 * namespace, the deterministic default derivation, and pure display helpers.
 * Pure module — no React, no subscriptions.
 */

/** Which side of the conversation an avatar belongs to. */
export type AvatarSide = 'user' | 'agent'

/** An uploaded raster image, stored as a small PNG data URL. */
export interface ImageAvatarSpec {
  kind: 'image'
  /** PNG data URL; capped by {@link MAX_AVATAR_DATA_URL_LENGTH}. */
  dataUrl: string
}

/** An emoji glyph on a solid background. */
export interface EmojiAvatarSpec {
  kind: 'emoji'
  /** One emoji glyph (or short sequence), rendered at face size. */
  emoji: string
  /** CSS color for the avatar disc; undefined resolves to a deterministic hue. */
  background?: string | undefined
}

/** One user choice: either a raster image or an emoji tile. */
export type AvatarSpec = ImageAvatarSpec | EmojiAvatarSpec

/** The `avatar` settings section: the user avatar plus per-agent overrides. */
export interface AvatarSettingsSection {
  user?: AvatarSpec | undefined
  agents?: Record<string, AvatarSpec> | undefined
}

/** Uploaded avatars are downscaled to this edge before storage. */
export const AVATAR_EDGE = 96

/** Data-URL storage cap (keeps the settings document small). */
export const MAX_AVATAR_DATA_URL_LENGTH = 96 * 1024

/** Emoji choices offered by the picker. */
export const EMOJI_PALETTE = [
  '🤖', '🐱', '🐶', '🐼', '🦊', '🐯', '🦁', '🐸',
  '🐙', '🦄', '🐳', '🦋', '🌸', '🌊', '🔥', '⭐',
  '🌙', '🍀', '🍎', '⚡', '🎈', '🎯', '🎨', '🧩',
] as const

/** Background hues offered by the picker (hsl hue values, fixed 55% saturation). */
export const BACKGROUND_HUES = [210, 262, 330, 12, 45, 150, 190, 280] as const

const AVATAR_SATURATION = 55
const AVATAR_LIGHTNESS = 45

/** The user side's fixed default hue (deep blue). */
const USER_DEFAULT_HUE = 210

/**
 * Deterministic hue for one agent identity: a stable FNV-1a hash of the
 * session id folded into the full hue circle, so every agent gets a distinct
 * but stable default disc without any stored state.
 * @param seed - the identity string (session id).
 * @returns a hue in [0, 360).
 */
export function agentHue(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 360
}

/** The fallback disc color for one side. */
export function fallbackBackground(side: AvatarSide, seed: string): string {
  const hue = side === 'user' ? USER_DEFAULT_HUE : agentHue(seed)
  return `hsl(${hue} ${AVATAR_SATURATION}% ${AVATAR_LIGHTNESS}%)`
}

/** The background color of an explicit emoji spec, or a deterministic hue. */
export function specBackground(spec: EmojiAvatarSpec, side: AvatarSide, seed: string): string {
  return spec.background ?? fallbackBackground(side, seed)
}

/**
 * The fallback glyph for one side: the first meaningful character of the
 * agent title, or the user label (localized at the call site) when the title
 * has none. Pure string projection; the caller chooses the user label.
 * @param title - agent title (session display title), may be empty.
 * @param userLabel - localized user label used when `side` is user.
 * @returns a single display character.
 */
export function fallbackInitial(side: AvatarSide, title: string, userLabel: string): string {
  if (side === 'user') return userLabel
  const trimmed = title.trim()
  if (trimmed === '') return 'A'
  return Array.from(trimmed)[0] ?? 'A'
}

/** Whether a value is a well-formed {@link ImageAvatarSpec}. */
export function isImageAvatarSpec(value: unknown): value is ImageAvatarSpec {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { kind?: unknown; dataUrl?: unknown }
  return candidate.kind === 'image'
    && typeof candidate.dataUrl === 'string'
    && candidate.dataUrl.length > 0
    && candidate.dataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH
}

/** Whether a value is a well-formed {@link EmojiAvatarSpec}. */
export function isEmojiAvatarSpec(value: unknown): value is EmojiAvatarSpec {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { kind?: unknown; emoji?: unknown; background?: unknown }
  return candidate.kind === 'emoji'
    && typeof candidate.emoji === 'string'
    && candidate.emoji.length > 0
    && candidate.emoji.length <= 16
    && (candidate.background === undefined || typeof candidate.background === 'string')
}

/** Whether a value is a well-formed {@link AvatarSpec}. */
export function isAvatarSpec(value: unknown): value is AvatarSpec {
  return isImageAvatarSpec(value) || isEmojiAvatarSpec(value)
}

/**
 * Deep equality over JSON-compatible avatar values (the wire round-trips
 * objects, so identity never survives a write).
 * @param left - one JSON value.
 * @param right - the other.
 * @returns whether the two are structurally equal.
 */
export function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((entry, index) => jsonEqual(entry, right[index]))
  }
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(key => key in b && jsonEqual(a[key], b[key]))
}

/**
 * Narrow one wire section to the avatar section shape. Malformed values are
 * dropped per-field (never whole-section): a corrupt agent entry must not
 * disable the user's own avatar or every other agent override.
 * @param section - the wire section value.
 * @returns the normalized section.
 */
export function decodeAvatarSection(section: unknown): AvatarSettingsSection {
  if (typeof section !== 'object' || section === null || Array.isArray(section)) return {}
  const raw = section as Record<string, unknown>
  const user = isAvatarSpec(raw['user']) ? raw['user'] : undefined
  const rawAgents = raw['agents']
  const agents: Record<string, AvatarSpec> = {}
  if (typeof rawAgents === 'object' && rawAgents !== null && !Array.isArray(rawAgents)) {
    for (const [sessionId, spec] of Object.entries(rawAgents)) {
      if (isAvatarSpec(spec)) agents[sessionId] = spec
    }
  }
  return user === undefined && Object.keys(agents).length === 0
    ? {}
    : { ...user === undefined ? {} : { user }, ...Object.keys(agents).length === 0 ? {} : { agents } }
}
