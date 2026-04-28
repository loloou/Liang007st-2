/**
 * 图片下载工具函数
 */

const DOWNLOAD_TIMEOUT_MS = 30_000; // 30 秒超时

/**
 * 下载单张图片
 * @param url 图片URL
 * @param filename 下载文件名（可选，默认从URL提取或生成时间戳文件名）
 */
export async function downloadImage(url: string, filename?: string): Promise<void> {
  try {
    // 如果是blob URL直接下载
    if (url.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `image_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 从URL提取文件名
    const getFileName = (): string => {
      if (filename) return filename;
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const name = path.split('/').pop() || '';
        if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) {
          return name;
        }
      } catch {/* ignore */}
      return `image_${Date.now()}.png`;
    };

    // 带超时的 fetch
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = getFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.error('下载图片失败:', error);
    throw error;
  }
}

/**
 * 批量下载多张图片
 * @param images 图片URL列表或对象列表
 * @param prefix 文件名前缀（可选）
 */
export async function downloadImages(
  images: string[] | { url: string; id?: string }[],
  prefix: string = 'image'
): Promise<void> {
  const urls = images.map(img => typeof img === 'string' ? img : img.url);

  // 使用Promise.allSettled并行下载
  const results = await Promise.allSettled(
    urls.map((url, index) =>
      downloadImage(url, `${prefix}_${String(index + 1).padStart(3, '0')}.png`)
    )
  );

  // 统计成功和失败数量
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failCount = results.filter(r => r.status === 'rejected').length;

  if (failCount > 0) {
    console.warn(`批量下载完成: 成功 ${successCount} 张, 失败 ${failCount} 张`);
  }
}
