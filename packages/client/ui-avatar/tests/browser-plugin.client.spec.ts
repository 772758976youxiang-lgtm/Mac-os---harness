// @vitest-environment jsdom
/**
 * ui-avatar browser half on a real cordis Context with fake slots/locale/
 * settingsScope faces: the plugin registers the conversation.avatar occupant
 * with the documented locale, the inject face exposes the shared store and
 * the controller, and the node half registers the `avatar` settings namespace
 * with a schema. The node half and the invariant companion are exercised over
 * the same Context.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
import type { AvatarInjected } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import type { AvatarSettingsSection } from '../src/client/avatar-spec.ts'

afterEach(cleanup)

/** A controllable fake settings scope recording every write. */
function fakeScope() {
  let snapshot = {
    status: 'ready' as const,
    value: {} as AvatarSettingsSection | undefined,
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host' as const,
  }
  const listeners = new Set<() => void>()
  const writes: { field: string; value: unknown }[] = []
  const scope: SettingsScope<AvatarSettingsSection> = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field, value) => {
      writes.push({ field, value })
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value }, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
    },
    unset: async (field) => {
      writes.push({ field, value: undefined })
      const { [field]: _removed, ...rest } = (snapshot.value ?? {}) as Record<string, unknown>
      snapshot = { ...snapshot, value: rest, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
    },
  }
  return { scope, writes }
}

/** Boot the plugin over fake faces; the binder records every bind spec. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.avatar': { kind: 'single', scope: 'session' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const binds: SettingsScopeSpec<AvatarSettingsSection>[] = []
  const scopeHost = fakeScope()
  class SettingsScopeService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'settingsScope')
    }

    bind(spec: SettingsScopeSpec<AvatarSettingsSection>): SettingsScope<AvatarSettingsSection> {
      binds.push(spec)
      return scopeHost.scope
    }
  }
  new SettingsScopeService(ctx)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return {
    ctx,
    fiber,
    binds,
    scopeHost,
    entry: () => {
      const entry = ctx.slots.entries('conversation.avatar')[0]
      if (entry === undefined) return undefined
      return {
        ...entry.options,
        locale: entry.locale,
        inject: entry.inject as unknown as (() => AvatarInjected) | undefined,
      }
    },
  }
}

describe('ui-avatar browser plugin', () => {
  it('registers the conversation.avatar occupant with the avatar locale', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.entry()).toMatchObject({ locale: 'avatar' })
    expect(b.entry()?.inject).toBeTypeOf('function')
  })

  it('binds the avatar settings namespace with the section decoder', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.binds).toHaveLength(1)
    expect(b.binds[0]?.namespace).toBe('avatar')
    expect(b.binds[0]?.decode).toBeTypeOf('function')
    expect(b.binds[0]?.decode?.({ user: { kind: 'emoji', emoji: '🤖' } }))
      .toEqual({ user: { kind: 'emoji', emoji: '🤖' } })
  })

  it('exposes one shared store and the controller through the inject face', async () => {
    const b = await bench()
    await b.fiber.await()

    const face = b.entry()!.inject!()
    expect(face.hooks.avatar).toBeTypeOf('object')
    expect(face.controller).toBeTypeOf('object')
    await face.controller.load()
    await face.controller.setAgent('s1', { kind: 'emoji', emoji: '🐱' })
    expect(b.scopeHost.writes).toEqual([{ field: 'agents', value: { s1: { kind: 'emoji', emoji: '🐱' } } }])
  })

  it('registers the avatar namespace on the host settings service', async () => {
    const ctx = new Context()
    const registrations: { ns: string; schema: unknown }[] = []
    class SettingsService extends Service {
      constructor(serviceCtx: Context) {
        super(serviceCtx, 'settings')
      }

      register(ns: string, schema: unknown) {
        registrations.push({ ns, schema })
        return { get: () => ({}), watch: () => () => {}, update: async () => {}, replace: async () => {} }
      }
    }
    new SettingsService(ctx)
    await ctx.plugin({ inject: ['settings'], apply: nodeApply }).await()
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.ns).toBe('avatar')
  })
})
