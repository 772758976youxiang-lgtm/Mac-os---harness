/** `avatar` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'surface.userLabel': '我',
  'surface.agentFallback': 'A',
  'surface.change': '更换头像',
  'surface.userAria': '我的头像（点击更换）',
  'surface.agentAria': 'Agent 头像（点击更换）',
  'picker.title': '设置头像',
  'picker.userScope': '我的头像',
  'picker.agentScope': 'Agent 头像',
  'picker.upload': '上传图片',
  'picker.uploadHint': '将自动裁剪为 96×96 并压缩',
  'picker.emoji': '表情',
  'picker.background': '背景',
  'picker.preview': '预览',
  'picker.reset': '恢复默认',
  'picker.cancel': '取消',
  'picker.save': '保存',
  'picker.saved': '头像已保存',
  'picker.invalidImage': '无法读取这张图片',
  'picker.tooLarge': '图片压缩后仍然过大，请换一张',
  'picker.saveFailed': '保存失败，请重试',
  'picker.readFailed': '图片读取失败',
} satisfies Record<string, string>

/** The avatar namespace key union. */
export type AvatarKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The chat avatar surfaces' copy. */
    avatar: AvatarKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'surface.userLabel': 'Me',
  'surface.agentFallback': 'A',
  'surface.change': 'Change avatar',
  'surface.userAria': 'Your avatar (click to change)',
  'surface.agentAria': 'Agent avatar (click to change)',
  'picker.title': 'Avatar',
  'picker.userScope': 'Your avatar',
  'picker.agentScope': 'Agent avatar',
  'picker.upload': 'Upload image',
  'picker.uploadHint': 'Cropped to 96×96 and compressed',
  'picker.emoji': 'Emoji',
  'picker.background': 'Background',
  'picker.preview': 'Preview',
  'picker.reset': 'Reset to default',
  'picker.cancel': 'Cancel',
  'picker.save': 'Save',
  'picker.saved': 'Avatar saved',
  'picker.invalidImage': 'Could not read this image',
  'picker.tooLarge': 'The compressed image is still too large; try another',
  'picker.saveFailed': 'Save failed, please retry',
  'picker.readFailed': 'Image read failed',
} satisfies Record<AvatarKey, string>
