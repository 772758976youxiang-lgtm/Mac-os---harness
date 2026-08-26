/**
 * AvatarSettingsStore over a real mirror-derived scope: ready-state
 * derivation, revision-fenced writes (set/unset), per-agent map surgery, the
 * memory-mode process-local fallback, and failure reporting.
 */
import { describe, expect, it, vi } from 'vitest'
import type { RpcResponse } from '@deepseek-ai/dsh-api-remotes/client'
import { Context } from '@deepseek-ai/cordis'
import { SettingsSchemaService } from '@deepseek-ai/dsh-client-ui-settings/src/client/schema.ts'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { SettingsScopeController } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-scope.ts'
import { AvatarSettingsStore } from '../src/client/avatar-store.ts'
import { decodeAvatarSection, type AvatarSpec } from '../src/client/avatar-spec.ts'

const NS = 'avatar'
const IMAGE: AvatarSpec = { kind: 'image', dataUrl: 'data:image/png;base64,AAAA' }
const EMOJI: AvatarSpec = { kind: 'emoji', emoji: '🤖' }

const schemaService = new SettingsSchemaService(new Context())

let rpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `avatar-${rpc++}` as never, result: { ok: true, value } }
}

function namespace(value: unknown = {}, revision = 0) {
  return {
    ns: NS,
    schema: {},
    value,
    applies: 'live' as const,
    secrets: [],
    revision,
  }
}

function section(user?: AvatarSpec, agents: Record<string, AvatarSpec> = {}) {
  return {
    ...user === undefined ? {} : { user },
    ...Object.keys(agents).length === 0 ? {} : { agents },
  }
}

/** The avatar store over a real mirror-derived scope and a fake wire. */
function buildAvatar(
  api: { describe?: ReturnType<typeof vi.fn>; mutate?: ReturnType<typeof vi.fn> },
  persistence: 'host' | 'memory' = 'host',
) {
  const wire = { settings: api } as never
  const mirror = new SettingsDescribeMirror(wire, persistence)
  const scope = new SettingsScopeController(
    wire,
    { namespace: NS, decode: decodeAvatarSection },
    mirror,
    persistence,
    schemaService,
  )
  return { mirror, controller: new AvatarSettingsStore(scope) }
}

describe('AvatarSettingsStore', () => {
  it('derives the ready state from the namespace section', async () => {
    const describeCall = vi.fn(() => Promise.resolve(ok({
      writable: true,
      hasDocument: false,
      namespaces: [namespace(section(IMAGE, { s1: EMOJI }), 2)],
    })))
    const { mirror, controller } = buildAvatar({ describe: describeCall })
    await mirror.load()
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      user: IMAGE,
      agents: { s1: EMOJI },
      writable: true,
    })
  })

  it('stays loading until the settings read answers', async () => {
    const describeCall = vi.fn(() => Promise.reject(new Error('offline')))
    const { mirror, controller } = buildAvatar({ describe: describeCall })
    await mirror.load()
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('loading')
  })

  it('sets the user avatar through one revision-fenced write', async () => {
    const describeCall = vi.fn(() => Promise.resolve(ok({
      writable: true, hasDocument: false, namespaces: [namespace({}, 3)],
    })))
    const mutate = vi.fn(() => Promise.resolve(ok(namespace(section(IMAGE), 4))))
    const { mirror, controller } = buildAvatar({ describe: describeCall, mutate })
    await mirror.load()
    await controller.load()

    await expect(controller.setUser(IMAGE)).resolves.toBe(true)
    expect(mutate).toHaveBeenCalledWith({
      ns: NS,
      ops: [{ op: 'set', path: ['user'], value: IMAGE }],
      expectedRevision: 3,
    })
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', user: IMAGE })
  })

  it('clears the user avatar with unset', async () => {
    const describeCall = vi.fn(() => Promise.resolve(ok({
      writable: true, hasDocument: false, namespaces: [namespace(section(IMAGE), 1)],
    })))
    const mutate = vi.fn(() => Promise.resolve(ok(namespace())))
    const { mirror, controller } = buildAvatar({ describe: describeCall, mutate })
    await mirror.load()
    await controller.load()

    await expect(controller.setUser(null)).resolves.toBe(true)
    expect(mutate).toHaveBeenCalledWith({
      ns: NS,
      ops: [{ op: 'unset', path: ['user'] }],
      expectedRevision: 1,
    })
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', user: undefined })
  })

  it('stores one agent override without touching siblings', async () => {
    const describeCall = vi.fn(() => Promise.resolve(ok({
      writable: true, hasDocument: false, namespaces: [namespace(section(undefined, { s1: EMOJI }), 5)],
    })))
    const mutate = vi.fn(() => Promise.resolve(ok(namespace(section(undefined, { s1: EMOJI, s2: IMAGE }), 6))))
    const { mirror, controller } = buildAvatar({ describe: describeCall, mutate })
    await mirror.load()
    await controller.load()

    await expect(controller.setAgent('s2', IMAGE)).resolves.toBe(true)
    expect(mutate).toHaveBeenCalledWith({
      ns: NS,
      ops: [{ op: 'set', path: ['agents'], value: { s1: EMOJI, s2: IMAGE } }],
      expectedRevision: 5,
    })
    expect(controller.store.getSnapshot()).toMatchObject({ agents: { s1: EMOJI, s2: IMAGE } })
  })

  it('removes one agent override and unsets the map when it empties', async () => {
    const describeCall = vi.fn(() => Promise.resolve(ok({
      writable: true, hasDocument: false, namespaces: [namespace(section(undefined, { s1: EMOJI }), 2)],
    })))
    const mutate = vi.fn(() => Promise.resolve(ok(namespace())))
    const { mirror, controller } = buildAvatar({ describe: describeCall, mutate })
    await mirror.load()
    await controller.load()

    await expect(controller.setAgent('s1', null)).resolves.toBe(true)
    expect(mutate).toHaveBeenCalledWith({
      ns: NS,
      ops: [{ op: 'unset', path: ['agents'] }],
      expectedRevision: 2,
    })
    expect(controller.store.getSnapshot()).toMatchObject({ agents: {} })
  })

  it('reports a refused write and keeps the previous state', async () => {
    const describeCall = vi.fn(() => Promise.resolve(ok({
      writable: true, hasDocument: false, namespaces: [namespace({}, 1)],
    })))
    const mutate = vi.fn(() => Promise.reject(new Error('disk full')))
    const { mirror, controller } = buildAvatar({ describe: describeCall, mutate })
    await mirror.load()
    await controller.load()

    // The scope recovers silently from a refused write (SettingsScopeController
    // swallows the wire failure and re-reads), so the store reports persistence
    // failure by re-checking the authoritative section, not the thrown error.
    await expect(controller.setUser(IMAGE)).resolves.toBe(false)
    const state = controller.store.getSnapshot()
    expect(state.error).toBe('the avatar choice did not persist')
    expect(state.user).toBeUndefined()
  })

  it('keeps remote browsers process-local without wire calls', async () => {
    const describeCall = vi.fn()
    const mutate = vi.fn()
    const { controller } = buildAvatar({ describe: describeCall, mutate }, 'memory')
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', user: undefined, writable: false })

    await expect(controller.setUser(EMOJI)).resolves.toBe(true)
    expect(controller.store.getSnapshot()).toMatchObject({ user: EMOJI })
    await expect(controller.setUser(null)).resolves.toBe(true)
    expect(controller.store.getSnapshot()).toMatchObject({ user: undefined })
    await expect(controller.setAgent('s1', EMOJI)).resolves.toBe(true)
    expect(controller.store.getSnapshot()).toMatchObject({ agents: { s1: EMOJI } })
    expect(describeCall).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('stops publishing after dispose', async () => {
    const describeCall = vi.fn(() => Promise.resolve(ok({
      writable: true, hasDocument: false, namespaces: [namespace()],
    })))
    const { mirror, controller } = buildAvatar({ describe: describeCall })
    await mirror.load()
    await controller.load()
    controller.dispose()
    await controller.load()
    // A second mirror publish after dispose must not throw or republish.
    await mirror.load()
    expect(controller.store.getSnapshot().status).toBe('ready')
  })
})
