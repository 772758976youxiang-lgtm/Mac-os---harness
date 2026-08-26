/**
 * Avatar settings store: the browser mirror of the `avatar` settings
 * namespace. One shared store per client; every avatar surface reads the same
 * snapshot and routes its explicit choices through the scope's serialized
 * write path (ordering, revision fencing, and recovery all belong to the
 * SettingsScopeController).
 */

import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { jsonEqual, type AvatarSettingsSection, type AvatarSpec } from './avatar-spec.ts'

/** State rendered by every avatar surface. */
export interface AvatarSettingsState {
  status: 'loading' | 'ready' | 'unavailable'
  /** The user's own avatar choice, when one is stored. */
  user: AvatarSpec | undefined
  /** Per-agent avatar overrides by session id (frozen map). */
  agents: Readonly<Record<string, AvatarSpec>>
  /** Whether the Host document accepts writes (memory mode never does). */
  writable: boolean
  /** A write is in flight; surfaces may disable their save affordance. */
  saving: boolean
  /** Last write failure text, cleared by the next write attempt. */
  error: string | null
}

/* v8 ignore next 3 -- closed-union default only defends future source widening */
function assertNever(_value: never): never {
  throw new Error('unexpected avatar settings status')
}

/**
 * Coordinates the durable avatar section for every surface in this client.
 */
export class AvatarSettingsStore {
  /** uSES-safe state source shared by every registered avatar surface. */
  readonly store: SnapshotStore<AvatarSettingsState> = createSnapshotStore<AvatarSettingsState>({
    status: 'loading', user: undefined, agents: {}, writable: false, saving: false, error: null,
  })

  private following: (() => void) | undefined
  private saving = false
  /** Remote-browser process-local mirrors (the scope's memory mode never stores). */
  private localUser: AvatarSpec | undefined
  private localAgents: Record<string, AvatarSpec> = {}

  /**
   * @param scope - the bound `avatar` settings namespace scope; its memory
   * mode keeps a remote browser's choices process-local.
   */
  constructor(private readonly scope: SettingsScope<AvatarSettingsSection>) {}

  /**
   * Begin following the bound scope (idempotent) and publish its current
   * answer.
   * @returns settlement after the current answer is published.
   */
  load(): Promise<void> {
    this.following ??= this.scope.subscribe(() => { this.derive() })
    this.derive()
    return Promise.resolve()
  }

  /**
   * Store the user's own avatar choice, or clear it with `null` (the field
   * re-inherits the composition layer — an absent section renders the
   * deterministic default).
   * @param spec - the chosen avatar, or `null` to reset to default.
   * @returns whether the choice persisted.
   */
  async setUser(spec: AvatarSpec | null): Promise<boolean> {
    if (this.scope.getSnapshot().mode === 'memory') {
      this.localUser = spec ?? undefined
      this.derive()
      return true
    }
    const expected = spec
    return this.write(
      async () => {
        if (spec === null) await this.scope.unset('user')
        else await this.scope.set('user', spec)
      },
      section => expected === null ? section?.user === undefined : jsonEqual(section?.user, expected),
    )
  }

  /**
   * Store one agent's avatar override, or remove it with `null` so that agent
   * falls back to its deterministic default.
   * @param sessionId - the agent session.
   * @param spec - the chosen avatar, or `null` to reset to default.
   * @returns whether the choice persisted.
   */
  async setAgent(sessionId: string, spec: AvatarSpec | null): Promise<boolean> {
    const current = this.scope.getSnapshot().mode === 'memory'
      ? this.localAgents
      : this.scope.getSnapshot().value?.agents ?? {}
    const next: Record<string, AvatarSpec> = {}
    for (const [id, stored] of Object.entries(current)) {
      if (id !== sessionId) next[id] = stored
    }
    if (spec !== null) next[sessionId] = spec
    if (this.scope.getSnapshot().mode === 'memory') {
      this.localAgents = next
      this.derive()
      return true
    }
    const expected = spec
    return this.write(
      async () => {
        const entries = Object.entries(next)
        if (entries.length === 0) await this.scope.unset('agents')
        else await this.scope.set('agents', Object.fromEntries(entries))
      },
      section => expected === null
        ? section?.agents?.[sessionId] === undefined
        : jsonEqual(section?.agents?.[sessionId], expected),
    )
  }

  /** Stop following the scope. */
  dispose(): void {
    this.following?.()
    this.following = undefined
  }

  /**
   * Run one scope write, then verify the section actually holds the choice.
   * The scope recovers silently from refused or failed writes, so settlement
   * alone cannot distinguish persistence from a recovery that kept the old
   * value; the predicate re-reads the authoritative section instead.
   */
  private async write(
    perform: () => Promise<void>,
    persisted: (section: AvatarSettingsSection | undefined) => boolean,
  ): Promise<boolean> {
    this.saving = true
    this.store.update((state) => { state.saving = true; state.error = null })
    try {
      await perform()
    } finally {
      this.saving = false
      this.store.update((state) => { state.saving = false })
    }
    this.derive()
    if (persisted(this.scope.getSnapshot().value)) return true
    this.store.update((state) => { state.error = 'the avatar choice did not persist' })
    return false
  }

  private derive(): void {
    if (this.saving) return
    const scope = this.scope.getSnapshot()
    if (scope.mode === 'memory') {
      this.store.update((state) => {
        state.status = 'ready'
        state.user = this.localUser
        state.agents = this.localAgents
        state.writable = false
        state.error = null
      })
      return
    }
    switch (scope.status) {
      case 'loading':
        this.store.update((state) => { state.status = 'loading'; state.error = null })
        return
      case 'unavailable':
        this.store.update((state) => {
          state.status = 'unavailable'
          state.user = undefined
          state.agents = {}
          state.writable = false
        })
        return
      case 'ready': {
        const section = scope.value
        this.store.update((state) => {
          state.status = 'ready'
          state.user = section?.user
          state.agents = section?.agents ?? {}
          state.writable = scope.writable
          state.error = null
        })
        return
      }
      /* v8 ignore next -- every current settings scope status is handled above */
      default: return assertNever(scope.status)
    }
  }
}
