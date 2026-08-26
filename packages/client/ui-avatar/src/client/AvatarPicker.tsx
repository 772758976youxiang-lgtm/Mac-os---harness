/**
 * AvatarPicker: the change-avatar modal. One draft spec (image data URL,
 * emoji + background, or `null` = default) is edited here and only persisted
 * on Save, so cancelling never writes. Uploaded images go through the
 * crop/compress pipeline in avatar-image.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, IconEditOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { importAvatarImage } from './avatar-image.ts'
import {
  BACKGROUND_HUES, EMOJI_PALETTE, fallbackBackground, fallbackInitial, specBackground,
  type AvatarSpec, type AvatarSide,
} from './avatar-spec.ts'
import type { AvatarSaveHandler } from './slots.ts'
import type { AvatarKey } from './locales.ts'
import css from './AvatarSurface.module.css'

/** Pure disc rendering shared by the surface and the picker preview. */
export function AvatarDisc({
  side, size, seed, title, userLabel, spec, interactive = false, ariaLabel, onActivate, className,
}: {
  side: AvatarSide
  /** Disc edge in px (32 for rows, 56 for the preview). */
  size: number
  /** Identity seed for deterministic fallback colors (session id, or 'user'). */
  seed: string
  /** Agent display title for the fallback initial. */
  title: string
  /** Localized user label for the fallback initial. */
  userLabel: string
  /** The stored choice; undefined renders the deterministic default. */
  spec: AvatarSpec | undefined
  /** Whether the disc is the interactive change button. */
  interactive?: boolean
  /** Accessible label for the interactive form. */
  ariaLabel?: string
  /** Open the picker (interactive only). */
  onActivate?: () => void
  className?: string
}) {
  const background = spec === undefined
    ? fallbackBackground(side, seed)
    : spec.kind === 'image'
      ? undefined
      : specBackground(spec, side, seed)
  const initial = fallbackInitial(side, title, userLabel)
  const content = spec === undefined ? (
    <span className={css.initial}>{initial}</span>
  ) : spec.kind === 'image' ? (
    <img className={css.image} src={spec.dataUrl} alt="" />
  ) : (
    <span className={css.emoji}>{spec.emoji}</span>
  )
  if (!interactive) {
    return (
      <div
        className={clsx(css.disc, size > 40 && css.discLarge, className)}
        style={background === undefined ? undefined : { background }}
        role="img"
        aria-label={ariaLabel}
      >
        {content}
      </div>
    )
  }
  return (
    <button
      type="button"
      className={clsx(css.disc, size > 40 && css.discLarge, className)}
      style={background === undefined ? undefined : { background }}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onActivate}
    >
      {content}
      <span className={css.editBadge} aria-hidden>
        <IconEditOutline16 size={14} />
      </span>
    </button>
  )
}

/** Picker props: scope facts, the current choice, and the save verb. */
export interface AvatarPickerProps {
  open: boolean
  onClose: () => void
  side: AvatarSide
  /** Session id for the agent scope (undefined = user scope). */
  sessionId: string | undefined
  /** Current agent display title (fallback initial source). */
  title: string
  /** The stored choice; undefined means default. */
  initial: AvatarSpec | undefined
  /** Persist one draft choice (`null` restores the default). */
  onSave: AvatarSaveHandler
  t: (key: AvatarKey) => string
}

/** The change-avatar modal body and footer. */
export function AvatarPicker({
  open, onClose, side, sessionId, title, initial, onSave, t,
}: AvatarPickerProps) {
  const [draft, setDraft] = useState<AvatarSpec | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const seed = side === 'user' ? 'user' : sessionId ?? 'agent'
  const scopeLabel = side === 'user' ? t('picker.userScope') : t('picker.agentScope')

  // Each open starts from the stored choice; the modal never edits live state.
  useEffect(() => {
    if (!open) return
    setDraft(initial ?? null)
    setError(null)
    setSaving(false)
  }, [open, initial])

  const pickEmoji = useCallback((emoji: string) => {
    setDraft((current) => {
      const base = current?.kind === 'emoji' ? current : undefined
      return { kind: 'emoji', emoji, ...base?.background === undefined ? {} : { background: base.background } }
    })
  }, [])

  const pickBackground = useCallback((hue: number) => {
    setDraft((current) => {
      if (current?.kind === 'emoji') return { ...current, background: `hsl(${hue} 55% 45%)` }
      return current
    })
  }, [])

  const handleFile = useCallback(async (file: File | undefined) => {
    if (file === undefined) return
    const result = await importAvatarImage(file)
    if (result.ok) {
      setDraft({ kind: 'image', dataUrl: result.dataUrl })
      setError(null)
    } else if (result.reason === 'large') {
      setError(t('picker.tooLarge'))
    } else {
      setError(result.reason === 'read' ? t('picker.readFailed') : t('picker.invalidImage'))
    }
  }, [t])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    const ok = await onSave(draft)
    setSaving(false)
    if (ok) onClose()
    else setError(t('picker.saveFailed'))
  }, [draft, onClose, onSave, t])

  const previewSpec = draft ?? undefined
  const backgroundHues = useMemo(() => [...BACKGROUND_HUES], [])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('picker.title')}
      closeLabel={t('picker.cancel')}
      description={scopeLabel}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={saving || draft === null}
            onClick={() => { setDraft(null); setError(null) }}
          >
            {t('picker.reset')}
          </Button>
          <Button variant="outline" className={css.modalAction} onClick={onClose}>
            {t('picker.cancel')}
          </Button>
          <Button variant="primary" className={css.modalAction} disabled={saving} onClick={() => { void save() }}>
            {t('picker.save')}
          </Button>
        </>
      )}
    >
      <div className={css.pickerBody}>
        <div className={css.previewRow}>
          <AvatarDisc
            side={side}
            size={56}
            seed={seed}
            title={title}
            userLabel={t('surface.userLabel')}
            spec={previewSpec}
            ariaLabel={t('picker.preview')}
          />
          <div className={css.previewMeta}>
            <span className={css.scopeLabel}>{scopeLabel}</span>
            {error !== null && <span className={css.errorNote} role="status">{error}</span>}
          </div>
        </div>

        <div className={css.uploadRow}>
          <Button variant="outline" icon={<IconEditOutline16 size={14} />} disabled={saving} onClick={() => { fileInput.current?.click() }}>
            {t('picker.upload')}
          </Button>
          <span className={css.uploadHint}>{t('picker.uploadHint')}</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className={css.fileInput}
            aria-hidden
            tabIndex={-1}
            onChange={(event) => { void handleFile(event.target.files?.[0]) }}
          />
        </div>

        <div>
          <div className={css.sectionLabel}>{t('picker.emoji')}</div>
          <div className={css.emojiGrid}>
            {EMOJI_PALETTE.map(emoji => (
              <button
                key={emoji}
                type="button"
                className={css.emojiCell}
                data-selected={draft?.kind === 'emoji' && draft.emoji === emoji || undefined}
                disabled={saving}
                onClick={() => { pickEmoji(emoji) }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {draft?.kind === 'emoji' && (
          <div>
            <div className={css.sectionLabel}>{t('picker.background')}</div>
            <div className={css.backgroundRow}>
              {backgroundHues.map(hue => (
                <button
                  key={hue}
                  type="button"
                  className={css.backgroundCell}
                  style={{ background: `hsl(${hue} 55% 45%)` }}
                  data-selected={draft.background === `hsl(${hue} 55% 45%)` || undefined}
                  disabled={saving}
                  aria-label={`hsl(${hue} 55% 45%)`}
                  onClick={() => { pickBackground(hue) }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
