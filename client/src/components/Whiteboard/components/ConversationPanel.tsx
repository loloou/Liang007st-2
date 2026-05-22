import React, { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'

const ConversationPanel: React.FC = () => {
  const {
    chatHistory,
    chatPanelOpen,
    setChatPanelOpen,
    clearChat,
    setLightboxUrl,
    retryFromMessage,
  } = useCanvasStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory.length])

  if (!chatPanelOpen) return null

  return (
    <div className="absolute bottom-28 left-4 top-4 z-20 flex w-80 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/95 shadow-2xl backdrop-blur-xl">
      {/* 头部 */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="text-xs font-bold text-slate-200">对话历史</span>
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-600">
            {chatHistory.length}
          </span>
        </div>
        <div className="flex gap-1">
          {chatHistory.length > 0 && (
            <button
              onClick={clearChat}
              className="rounded px-1.5 py-1 text-[10px] text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
            >
              清空
            </button>
          )}
          <button
            onClick={() => setChatPanelOpen(false)}
            className="px-1 text-xs text-slate-600 transition hover:text-slate-300"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {chatHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
            <svg
              className="h-10 w-10 text-slate-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-xs">在下方输入提示词开始创作</p>
          </div>
        ) : (
          chatHistory.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] space-y-2 rounded-xl px-3 py-2 ${
                  msg.role === 'user'
                    ? 'border border-indigo-500/10 bg-indigo-500/15 text-indigo-200'
                    : msg.error
                      ? 'border border-red-500/10 bg-red-500/10 text-red-300'
                      : 'border border-white/[0.06] bg-white/[0.04] text-slate-300'
                }`}
              >
                {/* 参考图 */}
                {msg.refImageUrls && msg.refImageUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.refImageUrls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="h-10 w-10 cursor-pointer rounded-lg border border-white/10 object-cover"
                        onClick={() => setLightboxUrl(url)}
                        draggable={false}
                      />
                    ))}
                  </div>
                )}

                <p className="text-xs leading-relaxed">{msg.content}</p>

                {/* 生成的图片 */}
                {msg.imageUrls && msg.imageUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.imageUrls.map((url, i) => (
                      <div key={i} className="group relative">
                        <img
                          src={url}
                          alt=""
                          className="h-20 w-20 cursor-pointer rounded-lg bg-slate-800 object-cover transition hover:ring-2 hover:ring-indigo-400/50"
                          onClick={() => setLightboxUrl(url)}
                          draggable={false}
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                          <button
                            onClick={() => {
                              useCanvasStore
                                .getState()
                                .addNode('image', undefined, { imageUrl: url, label: '来自对话' })
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/80 text-[9px] text-white"
                            title="发送到画布"
                          >
                            +
                          </button>
                          <a
                            href={url}
                            download={`image_${Date.now()}.png`}
                            className="flex h-6 w-6 items-center justify-center rounded-lg bg-black/60 text-white"
                            title="下载"
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] text-slate-600">
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {msg.model && <span className="ml-1 opacity-60">· {msg.model}</span>}
                  </p>
                  <div className="flex gap-2">
                    {msg.role === 'user' && (
                      <>
                        <button
                          onClick={() => navigator.clipboard.writeText(msg.content).catch(() => {})}
                          className="text-[9px] text-slate-600 transition hover:text-indigo-400"
                          title="复制提示词"
                        >
                          📋 复制
                        </button>
                        <button
                          onClick={() => retryFromMessage(msg.id)}
                          className="text-[9px] text-slate-600 transition hover:text-indigo-400"
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
  )
}

export default ConversationPanel
