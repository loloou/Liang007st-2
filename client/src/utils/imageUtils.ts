/**
 * 图片工具函数
 * 提供通用的图片处理功能
 */

/** 创建缩略图（限制 base64/blob URL 写入 localStorage 的体积） */
export async function createThumbnail(imageUrl: string, maxSize = 150): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          try {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          } catch {
            // tainted canvas（CORS 限制）— 降级返回空字符串，由调用方 fallback 到原图
            resolve("");
          }
        } else {
          resolve("");
        }
      } catch {
        resolve("");
      }
    };
    // 加载失败时静默降级，不 reject（避免中断调用方流程）
    img.onerror = () => resolve("");
    img.src = imageUrl;
  });
}
