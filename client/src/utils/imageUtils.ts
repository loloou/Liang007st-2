/**
 * 图片工具函数
 * 提供通用的图片处理功能
 */

/** 创建缩略图（限制 base64/blob URL 写入 localStorage 的体积） */
export async function createThumbnail(imageUrl: string, maxSize = 150): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    // 仅对外部 HTTP URL 设置 crossOrigin；data: / blob: URL 不需要且可能导致加载失败
    if (imageUrl.startsWith('http:') || imageUrl.startsWith('https:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      let canvas: HTMLCanvasElement | null = null
      try {
        canvas = document.createElement('canvas')
        let { width, height } = img
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width)
            width = maxSize
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height)
            height = maxSize
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          try {
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', 0.7))
          } catch {
            resolve(null)
          }
        } else {
          resolve(null)
        }
      } catch {
        resolve(null)
      } finally {
        if (canvas) {
          canvas.width = 0
          canvas.height = 0
        }
      }
    }
    img.onerror = () => resolve(null)
    img.src = imageUrl
  })
}
