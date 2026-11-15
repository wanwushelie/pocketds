import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * APK 内大文件导入的原生通道（优化 #1）：
 * WebView 文件选择器交给网页的是 content:// 管道文件，随机访问会 O(n²) 重读；
 * 这里改由原生层用系统文件选择器拿 content:// URI，整段拷进应用沙箱变成真实文件，
 * 之后 zipReader 对它的随机访问走 readRange 桥接，速度接近磁盘上限。
 * 网页端（非 APK）插件不存在，调用方退回原有 <input type="file"> 路径。
 */
export type CachedArchiveFile = {
  kind: 'cache'
  /** 沙箱内真实文件的绝对路径 */
  path: string
  name: string
  size: number
}

type PickedArchive = { path: string; name: string; size: number }

type ImportFileCachePlugin = {
  pickAndCache(): Promise<PickedArchive | undefined>
  readRange(options: { path: string; offset: number; length: number }): Promise<{ data: string }>
  release(options: { path: string }): Promise<void>
}

const ImportFileCache = registerPlugin<ImportFileCachePlugin>('ImportFileCache')

const base64Bytes = (data: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** 原生文件随机读：返回不超过 length 的字节，越界即抛错（与 zipReader 的 invalid 语义对齐）。 */
export const readCachedRange = async (
  path: string,
  start: number,
  length: number
): Promise<Uint8Array<ArrayBuffer>> => {
  // 零长度读（如无扩展字段的 ZIP 条目）不需要过桥
  if (length === 0) {
    return new Uint8Array(0)
  }
  const { data } = await ImportFileCache.readRange({ path, offset: start, length })
  const bytes = base64Bytes(data)
  if (bytes.length !== length) {
    throw new RangeError(`cached range ${start}+${length} read ${bytes.length} bytes`)
  }
  return bytes
}

/** 释放沙箱缓存文件；导入结束（无论成败）都应调用。 */
export const releaseCachedArchive = async (file: CachedArchiveFile): Promise<void> => {
  try {
    await ImportFileCache.release({ path: file.path })
  } catch (error) {
    console.warn('[import] release cached archive failed', error)
  }
}

/**
 * 打开系统文件选择器并把选中 ZIP 拷入沙箱。
 * 返回 undefined 表示不可用（网页端）或用户取消；插件异常同样回退 undefined，调用方走旧路径。
 */
export const pickArchiveSource = async (): Promise<CachedArchiveFile | undefined> => {
  if (!Capacitor.isNativePlatform()) {
    return undefined
  }
  try {
    const picked = await ImportFileCache.pickAndCache()
    return picked ? { kind: 'cache', ...picked } : undefined
  } catch (error) {
    console.warn('[import] native pick failed, fallback to file input', error)
    return undefined
  }
}
