import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { getApiConfig } from '../../../api/settings'
import { ASPECT_LIST } from '../store/useCanvasStore'
import { useGenerationStore } from '../../../store/generationStore'
import { safeUrl } from '../../../utils/safeUrl'
import { SIZE_TIERS, RESOLUTION_PRESETS, type SizeTierId } from '../../../utils/resolutionPresets'

const ASPECTS = ASPECT_LIST

const PromptBar: React.FC = () => {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [showNegative, setShowNegative] = useState(false)
  const [refImages, setRefImages] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showAspectPicker, setShowAspectPicker] = useState(false)
  const [showSizePicker, setShowSizePicker] = useState(false)
  const [showBatchPicker, setShowBatchPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { runGenerateFromPrompt, chatPanelOpen, setChatPanelOpen, chatHistory } = useCanvasStore()

  const selectedModel = useGenerationStore(s => s.model)
  const aspectRatio = useGenerationStore(s => s.resolutionPreset)
  const batchSize = useGenerationStore(s => s.batchSize)
  const sizeTier = useGenerationStore(s => s.sizeTier)
  const setSelectedModel = (m: string) => useGenerationStore.setState({ model: m })
  const setAspectRatio = (a: string) =>
    useGenerationStore
      .getState()
      .setResolutionPreset(a as import('../../../utils/resolutionPresets').ResolutionPresetId)
  const setBatchSize = (n: number) => useGenerationStore.getState().setBatchSize(n)
  const setSizeTier = (t: SizeTierId) => useGenerationStore.getState().setSizeTier(t)

  const modelList = (() => {
    try {
      return getApiConfig()
        .imageModels.map(m => ({ id: m.modelId, label: m.label || m.modelId }))
        .filter(m => m.id)
    } catch {
      return []
    }
  })()

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || isRunning) return
    setIsRunning(true)
    try {
      await runGenerateFromPrompt(
        prompt.trim(),
        refImages.length > 0 ? refImages : undefined,
        negativePrompt.trim() || undefined,
      )
      setPrompt('')
      setNegativePrompt('')
      setRefImages([])
    } finally {
      setIsRunning(false)
    }
  }, [prompt, refImages, isRunning, runGenerateFromPrompt, negativePrompt])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape') {
        setShowModelPicker(false)
        setShowAspectPicker(false)
        setShowSizePicker(false)
        setShowBatchPicker(false)
      }
    },
    [handleSend],
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string')
          setRefImages(p => [...p, reader.result as string].slice(-4))
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [prompt])

  const currentModelLabel =
    modelList.find(m => m.id === selectedModel)?.label || selectedModel || '选择模型'

  return (
    <div className="absolute bottom-6 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 px-4">
      <div className="rounded-2xl border border-white/[0.08] bg-slate-900/95 shadow-2xl backdrop-blur-xl">
        {/* 参考图预览 */}
        {refImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-1 pt-3">
            {refImages.map((url, i) => (
              <div key={i} className="group relative flex-shrink-0">
                <img
                  src={safeUrl(url)}
                  className="h-12 w-12 rounded-lg border border-white/10 object-cover"
                  alt=""
                />
                <button
                  onClick={() => setRefImages(p => p.filter((_, j) => j !== i))}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 主输入区 */}
        <div className="flex items-end gap-2 p-2">
          {/* 对话历史按钮 */}
          <button
            onClick={() => setChatPanelOpen(!chatPanelOpen)}
            className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition ${
              chatPanelOpen
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-white/[0.04] text-slate-500 hover:text-slate-300'
            }`}
            title="对话历史"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {chatHistory.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[8px] font-bold text-white">
                {chatHistory.length > 9 ? '9+' : chatHistory.length}
              </span>
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRunning ? '生成中...' : '描述你想创作的画面，Enter 发送 · Shift+Enter 换行'
            }
            disabled={isRunning}
            rows={1}
            className="max-h-[120px] flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none disabled:opacity-50"
          />

          <div className="flex items-center gap-1.5 pb-0.5">
            <button
              onClick={() => setShowNegative(!showNegative)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold transition ${
                showNegative
                  ? 'border border-red-500/20 bg-red-500/15 text-red-400'
                  : 'bg-white/[0.04] text-slate-600 hover:text-slate-400'
              }`}
              title="负向提示词"
            >
              N-
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500 transition hover:text-slate-300"
              title="添加参考图（若模型不支持将自动忽略）"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
            <button
              onClick={handleSend}
              disabled={!prompt.trim() || isRunning}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isRunning ? (
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 负向提示词 */}
        {showNegative && (
          <div className="border-t border-white/[0.04] px-3 pb-2 pt-2">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[9px] font-medium text-slate-600">负向提示词</span>
              <span className="text-[9px] text-slate-700">（不想要的内容）</span>
            </div>
            <textarea
              value={negativePrompt}
              onChange={e => setNegativePrompt(e.target.value)}
              placeholder="模糊, 低质量, 变形..."
              rows={2}
              className="w-full resize-none rounded-lg border border-white/[0.04] bg-slate-800/40 px-2 py-1.5 text-xs leading-relaxed text-slate-500 placeholder-slate-700 focus:border-red-500/20 focus:outline-none"
            />
          </div>
        )}

        {/* 底部参数栏 */}
        <div className="flex items-center gap-3 border-t border-white/[0.04] px-3 pb-2.5 pt-2">
          {/* 模型选择 */}
          <div className="relative min-w-0 flex-1">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex max-w-full items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
            >
              <svg
                className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span className="max-w-[140px] truncate">{currentModelLabel}</span>
              <svg
                className="h-3 w-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showModelPicker && (
              <div className="bg-slate-900/98 absolute bottom-full left-0 z-30 mb-2 max-h-60 min-w-[220px] overflow-y-auto rounded-xl border border-white/[0.08] shadow-2xl backdrop-blur-xl">
                <div className="border-b border-white/[0.06] px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                    选择模型
                  </span>
                </div>
                {modelList.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-slate-500">暂无模型</p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      请在「设置 → Image」中添加模型
                    </p>
                  </div>
                ) : (
                  modelList.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id)
                        setShowModelPicker(false)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition ${
                        selectedModel === m.id
                          ? 'bg-indigo-500/15 text-indigo-400'
                          : 'text-slate-300 hover:bg-white/[0.04]'
                      }`}
                    >
                      {selectedModel === m.id && (
                        <svg
                          className="h-3 w-3 flex-shrink-0 text-indigo-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                      <span className="truncate">{m.label}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 比例选择 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => {
                setShowAspectPicker(!showAspectPicker)
                setShowSizePicker(false)
                setShowBatchPicker(false)
              }}
              className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
            >
              <span>
                {RESOLUTION_PRESETS.find(p => p.id === aspectRatio)?.label ?? aspectRatio}
              </span>
              <svg
                className="h-3 w-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showAspectPicker && (
              <div className="bg-slate-900/98 absolute bottom-full left-0 z-30 mb-2 max-h-60 min-w-[100px] overflow-y-auto rounded-xl border border-white/[0.08] shadow-2xl backdrop-blur-xl">
                <div className="border-b border-white/[0.06] px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                    比例
                  </span>
                </div>
                {ASPECTS.map(a => (
                  <button
                    key={a}
                    onClick={() => {
                      setAspectRatio(a)
                      setShowAspectPicker(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                      aspectRatio === a
                        ? 'bg-indigo-500/15 text-indigo-400'
                        : 'text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {aspectRatio === a && (
                      <svg
                        className="h-3 w-3 flex-shrink-0 text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    <span>{RESOLUTION_PRESETS.find(p => p.id === a)?.label ?? a}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 分辨率档位 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => {
                setShowSizePicker(!showSizePicker)
                setShowAspectPicker(false)
                setShowBatchPicker(false)
              }}
              className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
            >
              <span>{sizeTier}</span>
              <svg
                className="h-3 w-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showSizePicker && (
              <div className="bg-slate-900/98 absolute bottom-full left-0 z-30 mb-2 min-w-[90px] rounded-xl border border-white/[0.08] shadow-2xl backdrop-blur-xl">
                <div className="border-b border-white/[0.06] px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                    分辨率
                  </span>
                </div>
                {SIZE_TIERS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSizeTier(t.id)
                      setShowSizePicker(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                      sizeTier === t.id
                        ? 'bg-indigo-500/15 text-indigo-400'
                        : 'text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {sizeTier === t.id && (
                      <svg
                        className="h-3 w-3 flex-shrink-0 text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 批量数量 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => {
                setShowBatchPicker(!showBatchPicker)
                setShowAspectPicker(false)
                setShowSizePicker(false)
              }}
              className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
            >
              <span>×{batchSize}</span>
              <svg
                className="h-3 w-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showBatchPicker && (
              <div className="bg-slate-900/98 absolute bottom-full left-0 z-30 mb-2 min-w-[80px] rounded-xl border border-white/[0.08] shadow-2xl backdrop-blur-xl">
                <div className="border-b border-white/[0.06] px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                    批量
                  </span>
                </div>
                {[1, 2, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => {
                      setBatchSize(n)
                      setShowBatchPicker(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                      batchSize === n
                        ? 'bg-indigo-500/15 text-indigo-400'
                        : 'text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {batchSize === n && (
                      <svg
                        className="h-3 w-3 flex-shrink-0 text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    <span>×{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="flex-shrink-0 font-mono text-[9px] text-slate-700">
            {prompt.length}/1000
          </span>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

export default PromptBar
