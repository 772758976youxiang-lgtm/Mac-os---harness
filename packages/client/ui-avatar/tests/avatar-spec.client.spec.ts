/**
 * Avatar domain model: spec validation, section decoding, and the
 * deterministic default derivation. Pure functions, so this spec runs in the
 * node environment.
 */
import { describe, expect, it } from 'vitest'
import {
  agentHue, decodeAvatarSection, fallbackBackground, fallbackInitial, isAvatarSpec,
  isEmojiAvatarSpec, isImageAvatarSpec, specBackground, MAX_AVATAR_DATA_URL_LENGTH,
  type AvatarSpec, type EmojiAvatarSpec,
} from '../src/client/avatar-spec.ts'

const imageSpec: AvatarSpec = { kind: 'image', dataUrl: 'data:image/png;base64,AAAA' }
const emojiSpec: AvatarSpec = { kind: 'emoji', emoji: '🤖' }

describe('avatar spec validation', () => {
  it('accepts well-formed image and emoji specs', () => {
    expect(isImageAvatarSpec(imageSpec)).toBe(true)
    expect(isEmojiAvatarSpec(emojiSpec)).toBe(true)
    expect(isAvatarSpec(imageSpec)).toBe(true)
    expect(isAvatarSpec(emojiSpec)).toBe(true)
    expect(isAvatarSpec({ kind: 'emoji', emoji: '🐱', background: '#fff' })).toBe(true)
  })

  it('rejects malformed specs', () => {
    expect(isAvatarSpec(null)).toBe(false)
    expect(isAvatarSpec('x')).toBe(false)
    expect(isAvatarSpec({ kind: 'image' })).toBe(false)
    expect(isAvatarSpec({ kind: 'image', dataUrl: '' })).toBe(false)
    expect(isAvatarSpec({ kind: 'image', dataUrl: 'x'.repeat(MAX_AVATAR_DATA_URL_LENGTH + 1) })).toBe(false)
    expect(isAvatarSpec({ kind: 'emoji', emoji: '' })).toBe(false)
    expect(isAvatarSpec({ kind: 'emoji', emoji: 'x'.repeat(17) })).toBe(false)
    expect(isAvatarSpec({ kind: 'emoji', emoji: '🤖', background: 42 })).toBe(false)
    expect(isAvatarSpec({ kind: 'photo', dataUrl: 'data:image/png;base64,AAAA' })).toBe(false)
  })
})

describe('decodeAvatarSection', () => {
  it('normalizes a well-formed section', () => {
    const section = decodeAvatarSection({ user: imageSpec, agents: { s1: emojiSpec } })
    expect(section).toEqual({ user: imageSpec, agents: { s1: emojiSpec } })
  })

  it('returns an empty section for non-object values', () => {
    expect(decodeAvatarSection(null)).toEqual({})
    expect(decodeAvatarSection('x')).toEqual({})
    expect(decodeAvatarSection([])).toEqual({})
  })

  it('drops a malformed user entry but keeps the rest', () => {
    expect(decodeAvatarSection({ user: { kind: 'image' }, agents: { s1: emojiSpec } }))
      .toEqual({ agents: { s1: emojiSpec } })
  })

  it('drops malformed agent entries without losing valid siblings', () => {
    expect(decodeAvatarSection({ agents: { bad: { kind: 'nope' }, good: emojiSpec } }))
      .toEqual({ agents: { good: emojiSpec } })
  })

  it('returns an empty section when nothing valid remains', () => {
    expect(decodeAvatarSection({ user: 42, agents: 'x' })).toEqual({})
  })
})

describe('deterministic defaults', () => {
  it('hashes one session id to a stable hue in range', () => {
    const hue = agentHue('session-abc')
    expect(hue).toBe(agentHue('session-abc'))
    expect(hue).toBeGreaterThanOrEqual(0)
    expect(hue).toBeLessThan(360)
  })

  it('spreads distinct ids across the hue circle', () => {
    const hues = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(id => agentHue(id)))
    expect(hues.size).toBeGreaterThan(1)
  })

  it('gives the user side a fixed blue fallback', () => {
    expect(fallbackBackground('user', 'any')).toBe('hsl(210 55% 45%)')
    expect(fallbackBackground('agent', 'any')).not.toBe(fallbackBackground('user', 'any'))
  })

  it('prefers an explicit emoji background', () => {
    const spec: EmojiAvatarSpec = { kind: 'emoji', emoji: '🤖', background: '#123456' }
    expect(specBackground(spec, 'agent', 's1')).toBe('#123456')
    expect(specBackground({ kind: 'emoji', emoji: '🤖' }, 'agent', 's1')).toBe(fallbackBackground('agent', 's1'))
  })

  it('projects the fallback initial', () => {
    expect(fallbackInitial('user', 'anything', '我')).toBe('我')
    expect(fallbackInitial('agent', '  天气助手  ', '我')).toBe('天')
    expect(fallbackInitial('agent', '   ', '我')).toBe('A')
    expect(fallbackInitial('agent', '', '我')).toBe('A')
  })
})
