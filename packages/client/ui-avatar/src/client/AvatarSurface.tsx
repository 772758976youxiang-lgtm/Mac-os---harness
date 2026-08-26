/**
 * AvatarSurface: the `conversation.avatar` slot occupant. One instance per
 * rendered row side (user bubble, assistant narration); all instances share
 * the one avatar settings store. Clicking the disc opens the change-avatar
 * picker scoped to the row's side (and, for agent rows, the session).
 */

import { useCallback, useEffect, useState } from 'react'
import type { AvatarSpec } from './avatar-spec.ts'
import { AvatarDisc, AvatarPicker } from './AvatarPicker.tsx'
import type { AvatarSurfaceProps } from './slots.ts'

/**
 * The avatar surface: renders one side's disc and owns its picker modal.
 * @param props - slot owner (`side`, `size`), framework shares, and the
 * injected settings face.
 * @returns the avatar disc (interactive) plus the picker modal.
 */
export function AvatarSurface({
  side, size = 32, sessionId, useSessions, useAvatar, controller, t,
}: AvatarSurfaceProps) {
  const state = useAvatar(snapshot => snapshot)
  // Lazy follow: surfaces are the only readers of the settings store, so the
  // scope subscription starts at first paint instead of at plugin activation.
  useEffect(() => {
    if (state.status === 'loading') void controller.load()
  }, [controller, state.status])

  const title = useSessions(s => s.byId[sessionId]?.displayTitle) ?? ''
  const spec = side === 'user' ? state.user : state.agents[sessionId]
  const seed = side === 'user' ? 'user' : sessionId
  const [pickerOpen, setPickerOpen] = useState(false)

  const save = useCallback(async (next: AvatarSpec | null): Promise<boolean> => (
    side === 'user' ? controller.setUser(next) : controller.setAgent(sessionId, next)
  ), [controller, sessionId, side])

  const ariaLabel = t(side === 'user' ? 'surface.userAria' : 'surface.agentAria')

  return (
    <>
      <AvatarDisc
        side={side}
        size={size}
        seed={seed}
        title={title}
        userLabel={t('surface.userLabel')}
        spec={spec}
        interactive
        ariaLabel={ariaLabel}
        onActivate={() => { setPickerOpen(true) }}
      />
      <AvatarPicker
        open={pickerOpen}
        onClose={() => { setPickerOpen(false) }}
        side={side}
        sessionId={side === 'user' ? undefined : sessionId}
        title={title}
        initial={spec}
        onSave={save}
        t={t}
      />
    </>
  )
}
