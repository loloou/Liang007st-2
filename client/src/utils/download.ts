/**
 * 图片下载工具函数
 */

const DOWNLOAD_TIMEOUT_MS = 30_000 // 30 秒超时

/** 生成基于当前时间的文件名，格式: Liang007_20260520_154512_001.png */
function makeTimestampFilename(index?: number, ext = 'png'): string {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const suffix = index != null ? `_${String(index).padStart(3, '0')}` : ''
  return `Liang007_${date}_${time}${suffix}.${ext}`
}

/**
 * 下载单张图片
 * @param url 图片URL
 * @param filename 下载文件名（可选，默认从URL提取或生成时间戳文件名）
 */
export async function downloadImage(url: string, filename?: string): Promise<void> {
  const getFileName = (): string => {
    if (filename) return filename
    try {
      const urlObj = new URL(url)
      const path = urlObj.pathname
      const name = path.split('/').pop() || ''
      if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) {
        return name
      }
    } catch {
      /* ignore */
    }
    return makeTimestampFilename()
  }

  const triggerDownload = (href: string, downloadName = getFileName()) => {
    const a = document.createElement('a')
    a.href = href
    a.download = downloadName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  try {
    if (url.startsWith('blob:')) {
      triggerDownload(url, filename || makeTimestampFilename())
      return
    }

    if (url.startsWith('data:')) {
      const [header, data = ''] = url.split(',', 2)
      const isBase64 = /;base64/i.test(header)
      const mime = header.match(/^data:([^;,]+)/)?.[1] || 'image/png'
      const binary = isBase64 ? atob(data) : decodeURIComponent(data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
      try {
        triggerDownload(blobUrl, getFileName())
      } finally {
        URL.revokeObjectURL(blobUrl)
      }
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    try {
      triggerDownload(blobUrl, getFileName())
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  } catch (error) {
    console.warn('fetch 下载图片失败，尝试使用浏览器直链下载兜底:', error)
    try {
      triggerDownload(url, getFileName())
      return
    } catch (fallbackError) {
      console.error('下载图片失败:', fallbackError)
      throw fallbackError
    }
  }
}

/**
 * 批量下载多张图片
 * @param images 图片URL列表或对象列表
 * @param prefix 文件名前缀（可选）
 */
export async function downloadImages(
  images: string[] | { url: string; originalUrl?: string; id?: string }[],
  _prefix: string = 'image',
): Promise<void> {
  const urls = images.map(img => (typeof img === 'string' ? img : img.originalUrl || img.url))

  // 使用Promise.allSettled并行下载
  const results = await Promise.allSettled(
    urls.map((url, index) => downloadImage(url, makeTimestampFilename(index + 1))),
  )

  // 统计成功和失败数量
  const successCount = results.filter(r => r.status === 'fulfilled').length
  const failCount = results.filter(r => r.status === 'rejected').length

  if (failCount > 0) {
    console.warn(`批量下载完成: 成功 ${successCount} 张, 失败 ${failCount} 张`)
  }
}
