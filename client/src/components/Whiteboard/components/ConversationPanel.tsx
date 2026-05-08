import React, { useEffect, useRef } from "react";
import { useCanvasStore } from "../store/useCanvasStore";

const ConversationPanel: React.FC = () => {
  const { chatHistory, chatPanelOpen, setChatPanelOpen, clearChat, setLightboxUrl, retryFromMessage } = useCanvasStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.length]);

  if (!chatPanelOpen) return null;

  return (
    <div className="absolute top-4 left-4 bottom-28 w-80 z-20 rounded-2xl border border-white/[0.08] bg-slate-900/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-xs font-bold text-slate-200">对话历史</span>
          <span className="text-[10px] text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{chatHistory.length}</span>
        </div>
        <div className="flex gap-1">
          {chatHistory.length > 0 && (
            <button onClick={clearChat} className="text-[10px] text-slate-600 hover:text-red-400 transition px-1.5 py-1 rounded hover:bg-red-500/10">
              清空
            </button>
          )}
          <button onClick={() => setChatPanelOpen(false)} className="text-slate-600 hover:text-slate-300 text-xs transition px-1">✕</button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
            <svg className="w-10 h-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-xs">在下方输入提示词开始创作</p>
          </div>
        ) : (
          chatHistory.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-xl px-3 py-2 space-y-2 ${
                msg.role === "user"
                  ? "bg-indigo-500/15 border border-indigo-500/10 text-indigo-200"
                  : msg.error
                  ? "bg-red-500/10 border border-red-500/10 text-red-300"
                  : "bg-white/[0.04] border border-white/[0.06] text-slate-300"
              }`}>
                {/* 参考图 */}
                {msg.refImageUrls && msg.refImageUrls.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {msg.refImageUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-10 h-10 object-cover rounded-lg border border-white/10 cursor-pointer" onClick={() => setLightboxUrl(url)} draggable={false} />
                    ))}
                  </div>
                )}

                <p className="text-xs leading-relaxed">{msg.content}</p>

                  {/* 生成的图片 */}
                  {msg.imageUrls && msg.imageUrls.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {msg.imageUrls.map((url, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={url}
                            alt=""
                            className="w-20 h-20 object-cover rounded-lg bg-slate-800 cursor-pointer hover:ring-2 hover:ring-indigo-400/50 transition"
                            onClick={() => setLightboxUrl(url)}
                            draggable={false}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={() => {
                                useCanvasStore.getState().addNode("image", undefined, { imageUrl: url, label: "来自对话" });
                              }}
                              className="w-6 h-6 rounded-lg bg-indigo-500/80 text-white flex items-center justify-center text-[9px]"
                              title="发送到画布"
                            >
                              +
                            </button>
                            <a
                              href={url}
                              download={`image_${Date.now()}.png`}
                              className="w-6 h-6 rounded-lg bg-black/60 text-white flex items-center justify-center"
                              title="下载"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] text-slate-600">
                    {new Date(msg.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    {msg.model && <span className="ml-1 opacity-60">· {msg.model}</span>}
                  </p>
                  <div className="flex gap-2">
                    {msg.role === "user" && (
                      <>
                        <button
                          onClick={() => navigator.clipboard.writeText(msg.content).catch(() => {})}
                          className="text-[9px] text-slate-600 hover:text-indigo-400 transition"
                          title="复制提示词"
                        >
                          📋 复制
                        </button>
                        <button
                          onClick={() => retryFromMessage(msg.id)}
                          className="text-[9px] text-slate-600 hover:text-indigo-400 transition"
                          title="重新生成"
                        >
                          ↺ 重试
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default ConversationPanel;
