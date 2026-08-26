/**
 * Uploaded-avatar image pipeline: read a picked file, cover-crop and
 * downscale it to the avatar edge, and encode it as a PNG data URL. Pure
 * browser API usage — no React, no subscriptions; failure reasons are
 * returned as tagged results so the picker can localize them.
 */

import { AVATAR_EDGE, MAX_AVATAR_DATA_URL_LENGTH } from './avatar-spec.ts'

/** Result of one avatar image import. */
export type AvatarImageResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: 'read' | 'invalid' | 'large' }

/** Read one image element's bytes as a data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => { reject(new Error('file read failed')) }
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('file read produced no text'))
    }
    reader.readAsDataURL(file)
  })
}

/** Decode an image data URL into an Image element. */
function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = () => { reject(new Error('image decode failed')) }
    image.onload = () => { resolve(image) }
    image.src = dataUrl
  })
}

/**
 * Cover-crop a source bitmap to a square and downscale it to the avatar
 * edge, then encode as PNG.
 * @param source - the decoded source image.
 * @returns the PNG data URL.
 */
export function cropToAvatar(source: HTMLImageElement): string {
  const side = Math.min(source.naturalWidth, source.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_EDGE
  canvas.height = AVATAR_EDGE
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('canvas 2d context unavailable')
  }
  // Cover: sample the largest centered square of the source.
  const sx = (source.naturalWidth - side) / 2
  const sy = (source.naturalHeight - side) / 2
  ctx.drawImage(source, sx, sy, side, side, 0, 0, AVATAR_EDGE, AVATAR_EDGE)
  return canvas.toDataURL('image/png')
}

/**
 * Import one picked file: read, decode, crop, compress, and size-check it.
 * @param file - the picked image file.
 * @returns the ready data URL, or the failure reason.
 */
export async function importAvatarImage(file: File): Promise<AvatarImageResult> {
  let dataUrl: string
  try {
    dataUrl = await readAsDataUrl(file)
  } catch (_readFailure) {
    return { ok: false, reason: 'read' }
  }
  try {
    const source = await decodeImage(dataUrl)
    dataUrl = cropToAvatar(source)
  } catch (_decodeFailure) {
    return { ok: false, reason: 'invalid' }
  }
  if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) return { ok: false, reason: 'large' }
  return { ok: true, dataUrl }
}
