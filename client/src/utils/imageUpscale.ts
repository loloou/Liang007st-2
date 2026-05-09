/**
 * 客户端图片放大工具
 * 当 API 返回的图片分辨率低于用户请求时，使用 Canvas 进行高质量放大
 */

/**
 * 将图片 URL 放大到指定尺寸（Canvas 高质量插值）
 * @param imageUrl 原始图片 URL（支持 http/data/blob）
 * @param targetWidth 目标宽度
 * @param targetHeight 目标高度
 * @returns 放大后的 data:image/png;base64 URL
 */
export async function upscaleImage(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  const img = await loadImage(imageUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // 已经是目标尺寸或更大，无需放大
  if (srcW >= targetWidth && srcH >= targetHeight) {
    return imageUrl;
  }

  // 分步放大（每次最多 2x），避免单次缩放过大导致质量损失
  let currentSrc: HTMLImageElement | HTMLCanvasElement = img;
  let currentW = srcW;
  let currentH = srcH;

  while (currentW < targetWidth || currentH < targetHeight) {
    const nextW = Math.min(currentW * 2, targetWidth);
    const nextH = Math.min(currentH * 2, targetHeight);

    const canvas = document.createElement("canvas");
    canvas.width = nextW;
    canvas.height = nextH;
    const ctx = canvas.getContext("2d")!;

    // 使用最高质量插值
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(currentSrc, 0, 0, nextW, nextH);

    currentSrc = canvas;
    currentW = nextW;
    currentH = nextH;
  }

  // 最终精确裁剪到目标尺寸
  if (currentW !== targetWidth || currentH !== targetHeight) {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(currentSrc, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/png");
  }

  if (currentSrc instanceof HTMLCanvasElement) {
    return currentSrc.toDataURL("image/png");
  }
  return imageUrl;
}

/**
 * 检测图片实际尺寸，判断是否需要放大
 * @returns 需要放大时返回 {actualW, actualH}，否则返回 null
 */
export async function detectImageSize(imageUrl: string): Promise<{ w: number; h: number } | null> {
  try {
    const img = await loadImage(imageUrl);
    return { w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法加载图片: ${url.slice(0, 100)}`));
    img.src = url;
  });
}
