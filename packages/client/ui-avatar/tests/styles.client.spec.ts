/**
 * Avatar surface stylesheet contract, asserted against the CSS text on disk.
 * A `--dsw-*` name the theme never declares fails silently, and the disc's
 * readable glyph and edit badge depend on the same tokens the theme defines.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/AvatarSurface.module.css', import.meta.url)),
  'utf8',
)
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

describe('AvatarSurface theme styles', () => {
  it('names only theme variables the token sheet defines', () => {
    const named = [...css.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)].map(match => match[1])
    expect(named.length).toBeGreaterThan(5)
    const undeclared = [...new Set(named)].filter(name => !tokens.includes(`  ${String(name)}:`))
    expect(undeclared).toEqual([])
  })

  it('never falls back to a literal colour', () => {
    expect(css).not.toMatch(/var\(--dsw-[a-z0-9-]+\s*,\s*(?:#|rgb|rgba|hsl|hsla)/)
  })

  it('keeps the disc a 1:1 rounded tile that never flexes', () => {
    // The disc sits in the message row flex; a grow/shrink/basis (or the
    // `flex:` shorthand) would let it stretch and break the round mask.
    expect(css).not.toMatch(/flex-(?:grow|shrink|basis)\s*:/)
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
  })
})
