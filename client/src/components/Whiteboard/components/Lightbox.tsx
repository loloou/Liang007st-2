import React, { useCallback, useEffect } from "react";
import { useCanvasStore } from "../store/useCanvasStore";
import { safeUrl } from "../../../utils/safeUrl";

const Lightbox: React.FC = () => {
  const url = useCanvasStore((s) => s.lightboxUrl);
  const setUrl = useCanvasStore((s) => s.setLightboxUrl);

  const close = useCallback(() => setUrl(null), [setUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && url) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, close]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[10001] bg-black/95 backdrop-blur-md flex items-center justify-center p-8 cursor-zoom-out"
      onClick={close}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
         <img src={safeUrl(url)} alt="" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" draggable={false} />
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
          <a href={url} download={`canvas_${Date.now()}.png`} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition backdrop-blur-sm">
            💾 下载
          </a>
          <button onClick={() => navigator.clipboard.writeText(url).catch(() => {})} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition backdrop-blur-sm">
            📋 复制 URL
          </button>
          <button onClick={close} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition backdrop-blur-sm">
            ✕ 关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default Lightbox;
