// @vitest-environment jsdom
/**
 * AvatarSurface rendering and the change-avatar picker: the disc reflects the
 * shared settings snapshot (default / image / emoji), clicking opens the
 * picker scoped to the row's side, the picker edits a local draft and saves
 * through the controller verb, uploads go through the image pipeline, and a
 * refused save surfaces inline without closing the modal.
 */
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { AvatarSettingsStore, type AvatarSettingsState } from '../src/client/avatar-store.ts'
import type { AvatarSpec } from '../src/client/avatar-spec.ts'
import type { AvatarSurfaceProps } from '../src/client/slots.ts'
import { AvatarSurface } from '../src/client/AvatarSurface.tsx'
import { zh } from '../src/client/locales.ts'

// The image pipeline is pure browser API (FileReader/Image/canvas); the
// component test pins the wiring, not the codec.
vi.mock('../src/client/avatar-image.ts', () => ({
  importAvatarImage: vi.fn(),
}))

import { importAvatarImage } from '../src/client/avatar-image.ts'

afterEach(cleanup)

const SESSION = 's-1' as SessionId
const IMAGE: AvatarSpec = { kind: 'image', dataUrl: 'data:image/png;base64,AAAA' }
const EMOJI: AvatarSpec = { kind: 'emoji', emoji: '🤖' }
const t = makeTranslate(zh, commonZh)

function readyState(overrides: Partial<AvatarSettingsState> = {}): AvatarSettingsState {
  return {
    status: 'ready',
    user: undefined,
    agents: {},
    writable: true,
    saving: false,
    error: null,
    ...overrides,
  }
}

/** Mount one avatar surface over a fixed store and a recording controller. */
function mount(options: {
  side?: 'user' | 'agent'
  sessionId?: string
  title?: string
  state?: AvatarSettingsState
  saveResult?: boolean
} = {}) {
  const store: SnapshotStore<AvatarSettingsState> = createSnapshotStore(options.state ?? readyState())
  const load = vi.fn(() => Promise.resolve())
  const setUser = vi.fn(() => Promise.resolve(options.saveResult ?? true))
  const setAgent = vi.fn(() => Promise.resolve(options.saveResult ?? true))
  const controller = { load, setUser, setAgent, dispose: vi.fn() } as unknown as AvatarSettingsStore
  const useAvatar = (<T,>(select: (v: AvatarSettingsState) => T): T =>
    useSyncExternalStore(listener => store.subscribe(listener), () => select(store.getSnapshot()))) as never
  const useSessions = (select: (s: unknown) => unknown): unknown =>
    select({ byId: { [options.sessionId ?? SESSION]: { displayTitle: options.title ?? '天气助手' } } })
  const props = {
    side: options.side ?? 'user',
    size: 32,
    sessionId: options.sessionId ?? SESSION,
    useSessions,
    useAvatar,
    controller,
    t,
  } as unknown as AvatarSurfaceProps
  return { ...render(<AvatarSurface {...props} />), controller, load, setUser, setAgent, store }
}

describe('AvatarSurface', () => {
  it('renders the deterministic default user disc', () => {
    const ui = mount({ side: 'user' })
    expect(ui.getByRole('button', { name: zh['surface.userAria'] })).toBeTruthy()
    expect(ui.getByText(zh['surface.userLabel'])).toBeTruthy()
  })

  it('renders the agent fallback initial from the session title', () => {
    const ui = mount({ side: 'agent', title: '深圳天气' })
    expect(ui.getByText('深')).toBeTruthy()
  })

  it('renders an explicit image spec as an img', () => {
    const ui = mount({ side: 'agent', state: readyState({ agents: { [SESSION]: IMAGE } }) })
    const img = ui.container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(IMAGE.dataUrl)
  })

  it('renders an emoji spec with its glyph', () => {
    const ui = mount({ side: 'user', state: readyState({ user: EMOJI }) })
    expect(ui.getByText('🤖')).toBeTruthy()
  })

  it('opens the picker on click and saves a new emoji through the controller', async () => {
    const ui = mount({ side: 'user' })
    fireEvent.click(ui.getByRole('button', { name: zh['surface.userAria'] }))
    expect(await screen.findByText(zh['picker.title'])).toBeTruthy()

    fireEvent.click(screen.getByText('🐱'))
    fireEvent.click(screen.getByRole('button', { name: zh['picker.save'] }))
    await act(async () => { await Promise.resolve() })

    expect(ui.setUser).toHaveBeenCalledWith({ kind: 'emoji', emoji: '🐱' })
    expect(screen.queryByText(zh['picker.title'])).toBeNull()
  })

  it('writes an agent avatar scoped to the session id', async () => {
    const ui = mount({ side: 'agent', sessionId: SESSION })
    fireEvent.click(ui.getByRole('button', { name: zh['surface.agentAria'] }))
    expect(await screen.findByText(zh['picker.title'])).toBeTruthy()

    fireEvent.click(screen.getByText('🦊'))
    fireEvent.click(screen.getByRole('button', { name: zh['picker.save'] }))
    await act(async () => { await Promise.resolve() })

    expect(ui.setAgent).toHaveBeenCalledWith(SESSION, { kind: 'emoji', emoji: '🦊' })
  })

  it('restores the default through reset, writing null', async () => {
    const ui = mount({ side: 'user', state: readyState({ user: EMOJI }) })
    fireEvent.click(ui.getByRole('button', { name: zh['surface.userAria'] }))
    expect(await screen.findByText(zh['picker.title'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['picker.reset'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['picker.save'] }))
    await act(async () => { await Promise.resolve() })

    expect(ui.setUser).toHaveBeenCalledWith(null)
  })

  it('keeps the picker open and shows the error when the save is refused', async () => {
    const ui = mount({ side: 'user', saveResult: false })
    fireEvent.click(ui.getByRole('button', { name: zh['surface.userAria'] }))
    expect(await screen.findByText(zh['picker.title'])).toBeTruthy()

    fireEvent.click(screen.getByText('🐼'))
    fireEvent.click(screen.getByRole('button', { name: zh['picker.save'] }))
    expect(await screen.findByText(zh['picker.saveFailed'])).toBeTruthy()
    expect(screen.queryByText(zh['picker.title'])).toBeTruthy()
  })

  it('routes a picked file through the image pipeline and previews the result', async () => {
    vi.mocked(importAvatarImage).mockResolvedValueOnce({ ok: true, dataUrl: 'data:image/png;base64,BBBB' })
    const ui = mount({ side: 'user' })
    fireEvent.click(ui.getByRole('button', { name: zh['surface.userAria'] }))
    expect(await screen.findByText(zh['picker.title'])).toBeTruthy()

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    fireEvent.change(input!, { target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] } })
    await act(async () => { await Promise.resolve() })

    expect(importAvatarImage).toHaveBeenCalled()
    const preview = document.querySelector('img')
    expect(preview?.getAttribute('src')).toBe('data:image/png;base64,BBBB')
  })

  it('shows the localized message when the picked file cannot be read', async () => {
    vi.mocked(importAvatarImage).mockResolvedValueOnce({ ok: false, reason: 'invalid' })
    const ui = mount({ side: 'user' })
    fireEvent.click(ui.getByRole('button', { name: zh['surface.userAria'] }))
    expect(await screen.findByText(zh['picker.title'])).toBeTruthy()

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    fireEvent.change(input!, { target: { files: [new File(['x'], 'bad.png', { type: 'image/png' })] } })
    expect(await screen.findByText(zh['picker.invalidImage'])).toBeTruthy()
  })

  it('loads the settings store on first paint', () => {
    const store: SnapshotStore<AvatarSettingsState> = createSnapshotStore({
      status: 'loading', user: undefined, agents: {}, writable: false, saving: false, error: null,
    })
    const load = vi.fn(() => Promise.resolve())
    const setUser = vi.fn(() => Promise.resolve(true))
    const setAgent = vi.fn(() => Promise.resolve(true))
    const controller = { load, setUser, setAgent, dispose: vi.fn() } as unknown as AvatarSettingsStore
    const useAvatar = (<T,>(select: (v: AvatarSettingsState) => T): T =>
      useSyncExternalStore(listener => store.subscribe(listener), () => select(store.getSnapshot()))) as never
    const props = {
      side: 'user' as const,
      sessionId: SESSION,
      useSessions: (() => undefined) as never,
      useAvatar,
      controller,
      t,
    } as unknown as AvatarSurfaceProps
    render(<AvatarSurface {...props} />)
    expect(load).toHaveBeenCalled()
  })
})
