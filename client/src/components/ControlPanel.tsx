/**
 * ControlPanel — 右侧控制栏（提示词 + 参考图 + 生图参数 + 生图按钮）
 *
 * 从 App.tsx 提取的独立组件。
 * 所有状态通过 props 传入，保持与主界面同步。
 */
import React, { useState, useRef } from 'react'
import { SIZE_TIERS, type SizeTierId, type ResolutionPresetId } from '../utils/resolutionPresets'
import { safeUrl } from '../utils/safeUrl'
import AspectRatioSelect from './AspectRatioSelect'

interface Props {
  prompt: string
  setPrompt: (v: string) => void
  negativePrompt: string
  setNegativePrompt: (v: string) => void
  promptHistory: string[]
  setPromptHistory: React.Dispatch<React.SetStateAction<string[]>>
  referenceSlots: (File | null)[]
  setReferenceSlots: React.Dispatch<React.SetStateAction<(File | null)[]>>
  referencePreviewUrls: (string | null)[]
  model: string
  setModel: (v: string) => void
  modelList: string[]
  resolutionPreset: ResolutionPresetId
  setResolutionPreset: (v: ResolutionPresetId) => void
  sizeTier: SizeTierId
  setSizeTier: (v: SizeTierId) => void
  batchSize: number
  setBatchSize: (v: number) => void
  parallelCount: number
  setParallelCount: (v: number) => void
  width: number
  height: number
  status: 'idle' | 'running'
  isRegularGenerating: boolean
  handleGenerate: () => void
  onOpenModelPicker: () => void
  onOptimize: () => void
  generationHistory: {
    id: string
    time: string
    prompt?: string
    model?: string
    width?: number
    height?: number
    batchSize?: number
    results?: unknown[]
    error?: string
  }[]
  onClearHistory: () => void
  onOpenDetailedLog: () => void
  onSelectLogEntry: (entry: {
    time: string
    request?: string
    response?: string
    error?: string
  }) => void
  onDeletePromptHistory: (index: number) => void
  rightPanelWidth?: number
}

const ControlPanel: React.FC<Props> = ({
  prompt,
  setPrompt,
  negativePrompt,
  setNegativePrompt,
  promptHistory,
  setPromptHistory,
  referenceSlots,
  setReferenceSlots,
  referencePreviewUrls,
  model,
  setModel,
  modelList,
  resolutionPreset,
  setResolutionPreset,
  sizeTier,
  setSizeTier,
  batchSize,
  setBatchSize,
  parallelCount,
  setParallelCount,
  width,
  height,
  status,
  isRegularGenerating,
  handleGenerate,
  onOpenModelPicker,
  onOptimize,
  generationHistory,
  onClearHistory,
  onOpenDetailedLog,
  onSelectLogEntry,
  onDeletePromptHistory,
  rightPanelWidth = 340,
}) => {
  const [refImgOpen, setRefImgOpen] = useState(true)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [selectedHistoryIndices, setSelectedHistoryIndices] = useState<Set<number>>(new Set())
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const handleReferenceSlotDrop = (index: number, e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setReferenceSlots(prev => {
        const next = [...prev]
        next[index] = file
        return next
      })
    }
  }

  const setReferenceSlot = (index: number, file: File | null) => {
    setReferenceSlots(prev => {
      const next = [...prev]
      next[index] = file
      return next
    })
  }

  const referenceImages = referenceSlots.filter((f): f is File => f != null)

  return (
    <aside
      className="app-scrollbar flex flex-shrink-0 flex-col gap-3 overflow-y-auto"
      style={{ width: rightPanelWidth, height: '100%', maxHeight: '100%' }}
    >
      {/* ── 提示词模块 ── */}
      <div className="glass-card workspace-panel flex flex-shrink-0 flex-col gap-2 px-3 pb-3 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">提示词</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[10px] text-amber-400 transition hover:bg-amber-500/10 hover:text-amber-300"
              onClick={onOptimize}
              title="提示词优化"
              disabled={!prompt.trim()}
            >
              优化
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            ref={promptRef}
            className="glass-input app-scrollbar w-full resize-none rounded-none border-0 px-2.5 py-2 text-xs"
            style={{ height: 100 }}
            placeholder="输入提示词，描述你想生成的图像…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                handleGenerate()
              }
            }}
          />

          {/* 历史记录下拉框（提示词下方） */}
          {promptHistory.length > 0 && (
            <div className="relative mt-1">
              <button
                type="button"
                className="glass-input flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-left text-[11px] text-slate-400 transition hover:bg-white/[0.06]"
                onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              >
                <span>📝 提示词历史 ({promptHistory.length})</span>
                <svg
                  className={`h-3 w-3 transition-transform ${showHistoryDropdown ? 'rotate-180' : ''}`}
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
              {showHistoryDropdown && (
                <div className="app-scrollbar glass-popup absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-white/[0.06] shadow-xl">
                  {/* 批量操作栏 */}
                  <div className="sticky top-0 flex items-center gap-1 border-b border-white/[0.06] bg-white/[0.04] px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="h-3 w-3 cursor-pointer"
                      checked={
                        selectedHistoryIndices.size === promptHistory.length &&
                        promptHistory.length > 0
                      }
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedHistoryIndices(new Set(promptHistory.map((_, i) => i)))
                        } else {
                          setSelectedHistoryIndices(new Set())
                        }
                      }}
                      title="全选"
                    />
                    <span className="flex-1 text-[10px] text-slate-500">
                      {selectedHistoryIndices.size > 0
                        ? `已选 ${selectedHistoryIndices.size}`
                        : '全选'}
                    </span>
                    {selectedHistoryIndices.size > 0 && (
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 text-[10px] text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => {
                          setPromptHistory(prev =>
                            prev.filter((_, i) => !selectedHistoryIndices.has(i)),
                          )
                          setSelectedHistoryIndices(new Set())
                        }}
                      >
                        删除
                      </button>
                    )}
                  </div>
                  {/* 历史项目列表 */}
                  <div className="divide-y divide-white/[0.04]">
                    {promptHistory.slice(0, 30).map((p, i) => (
                      <div
                        key={i}
                        className="group flex items-center gap-1 px-2 py-1.5 hover:bg-white/[0.06]"
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3 cursor-pointer"
                          checked={selectedHistoryIndices.has(i)}
                          onChange={e => {
                            const next = new Set(selectedHistoryIndices)
                            if (e.target.checked) next.add(i)
                            else next.delete(i)
                            setSelectedHistoryIndices(next)
                          }}
                        />
                        <button
                          type="button"
                          className="flex-1 truncate text-left text-[11px] text-slate-400 transition hover:text-slate-200"
                          onClick={() => {
                            setPrompt(p)
                            setShowHistoryDropdown(false)
                            setSelectedHistoryIndices(new Set())
                          }}
                        >
                          {p.length > 70 ? p.slice(0, 70) + '…' : p}
                        </button>
                        <button
                          type="button"
                          className="flex-shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                          onClick={e => {
                            e.stopPropagation()
                            onDeletePromptHistory(i)
                          }}
                          title="删除"
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 反向提示词 */}
        <div className="overflow-hidden rounded-lg border border-white/[0.06]">
          <textarea
            className="glass-input app-scrollbar w-full resize-none rounded-none border-0 px-2.5 py-2 text-xs"
            style={{ height: 68 }}
            placeholder="反向提示词（可选）"
            value={negativePrompt}
            onChange={e => setNegativePrompt(e.target.value)}
          />
        </div>
      </div>

      {/* ── 参考图 - 可折叠 ── */}
      <div className="glass-card workspace-panel flex-shrink-0 overflow-hidden rounded-xl">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.04]"
          onClick={() => setRefImgOpen(v => !v)}
        >
          <span className="flex items-center gap-1.5">
            <svg
              className="h-3 w-3 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            参考图
            {referenceImages.length > 0 && (
              <span className="rounded-full bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-medium text-primary-400">
                {referenceImages.length}
              </span>
            )}
          </span>
          <svg
            className={`h-3 w-3 text-slate-500 transition-transform duration-200 ${refImgOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          className={`overflow-hidden transition-all duration-200 ${refImgOpen ? 'max-h-52' : 'max-h-0'}`}
        >
          <div className="grid grid-cols-4 gap-2 px-3 pb-3">
            {[0, 1, 2, 3].map(index => (
              <label
                key={index}
                className={`relative flex aspect-square max-h-24 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/[0.1] bg-white/[0.03] transition hover:bg-white/[0.06] ${
                  dragSourceIndex === index ? 'ring-2 ring-primary-500' : ''
                }`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  if (dragSourceIndex !== null && dragSourceIndex !== index) {
                    // 交换位置
                    setReferenceSlots(prev => {
                      const next = [...prev]
                      ;[next[dragSourceIndex], next[index]] = [next[index], next[dragSourceIndex]]
                      return next
                    })
                  } else if (dragSourceIndex === null) {
                    // 上传新文件
                    handleReferenceSlotDrop(index, e)
                  }
                  setDragSourceIndex(null)
                }}
                draggable={referencePreviewUrls[index] ? true : false}
                onDragStart={() => {
                  if (referencePreviewUrls[index]) setDragSourceIndex(index)
                }}
                onDragEnd={() => setDragSourceIndex(null)}
              >
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    setReferenceSlot(index, f ?? null)
                    e.target.value = ''
                  }}
                />
                {referencePreviewUrls[index] ? (
                  <>
                    <img
                      src={safeUrl(referencePreviewUrls[index])}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-black/60 text-xs text-white transition-colors hover:bg-red-500/100"
                      title="删除图片"
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        setReferenceSlot(index, null)
                      }}
                    >
                      ×
                    </button>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5 text-center text-[9px] text-white">
                      点击可替换
                    </span>
                  </>
                ) : (
                  <span className="px-0.5 text-center text-[9px] text-slate-400">点击/拖拽</span>
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── 生图参数 ── */}
      <div className="glass-card workspace-panel flex flex-shrink-0 flex-col gap-2 rounded-xl px-3 py-2.5">
        <div className="text-xs font-semibold text-slate-300">生图参数</div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">宽高比</span>
            <AspectRatioSelect value={resolutionPreset} onChange={setResolutionPreset} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">分辨率</span>
            <div className="flex gap-1">
              {SIZE_TIERS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${
                    sizeTier === t.id
                      ? 'border-primary-500/30 bg-primary-500/10 text-primary-400'
                      : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.06]'
                  }`}
                  onClick={() => setSizeTier(t.id as SizeTierId)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">模型</span>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full truncate rounded-lg border border-white/[0.08] bg-white/[0.04] px-1.5 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
              title={model}
            >
              {[...new Set(model ? [model, ...modelList] : modelList)].map(id => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">数量</span>
            <select
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              className="w-16 rounded-lg border border-white/[0.08] bg-white/[0.04] px-1.5 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
            >
              {[1, 2, 4].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1.5">
          <span className="whitespace-nowrap text-[10px] font-medium text-slate-500">并行生图</span>
          <select
            value={parallelCount}
            onChange={e => setParallelCount(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            className="w-24 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
            title="最大同时运行任务数：每次点击只新增 1 个任务，视口数随路数变化"
          >
            <option value={1}>1 路</option>
            <option value={2}>2 路</option>
            <option value={3}>3 路</option>
            <option value={4}>4 路</option>
            <option value={5}>5 路</option>
            <option value={6}>6 路</option>
          </select>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="tabular-nums text-slate-500">
            {width} × {height} px
          </span>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition ${
              modelList.length > 0
                ? 'border-primary-500/20 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'
                : 'border-white/[0.08] bg-white/[0.04] text-slate-500 hover:bg-white/[0.08]'
            }`}
            onClick={onOpenModelPicker}
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            {modelList.length > 0 ? (
              <>
                已选 <span className="font-bold tabular-nums">{modelList.length}</span> 个模型 ·
                点击管理
              </>
            ) : (
              '点击选择模型'
            )}
          </button>
        </div>
      </div>

      {/* ── 生图按钮 ── */}
      <div className="glass-card workspace-panel flex flex-shrink-0 flex-col gap-1.5 rounded-xl px-3 py-2">
        <button
          onClick={handleGenerate}
          disabled={isRegularGenerating}
          aria-label={
            status === 'running' ? (parallelCount > 1 ? '新增并行生图' : '正在生图中') : '开始生图'
          }
          className={`relative h-10 w-full overflow-hidden rounded-xl text-sm font-semibold text-white transition-all ${
            status === 'running'
              ? isRegularGenerating
                ? 'generating-pulse cursor-not-allowed bg-primary-500/45 opacity-80'
                : 'generating-pulse bg-primary-500/70 hover:bg-primary-500/85'
              : 'gradient-button'
          }`}
        >
          {status === 'running' ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>{parallelCount > 1 && !isRegularGenerating ? '新增任务' : '正在生图中'}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>开始生图</span>
            </div>
          )}
        </button>
      </div>

      {/* ── 日志面板（生图按钮下方，填满剩余空间） ── */}
      <div className="glass-card workspace-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <span
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                status === 'running'
                  ? 'animate-pulse bg-green-400'
                  : generationHistory.length > 0 && generationHistory[0]?.error
                    ? 'bg-red-400'
                    : generationHistory.length > 0
                      ? 'bg-primary-400'
                      : 'bg-slate-600'
              }`}
            />
            日志
            {generationHistory.length > 0 && (
              <span className="text-[10px] text-slate-500">({generationHistory.length})</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="查看详细日志"
              className="rounded p-0.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
              onClick={onOpenDetailedLog}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h10"
                />
              </svg>
            </button>
            {generationHistory.length > 0 && (
              <button
                type="button"
                title="清空日志"
                className="rounded p-0.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                onClick={onClearHistory}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="app-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5 font-mono text-[10px] text-slate-400">
          {generationHistory.length === 0 ? (
            <p className="py-3 text-center italic text-slate-500">生图后显示日志…</p>
          ) : (
            generationHistory.slice(0, 30).map(entry => (
              <div
                key={entry.id}
                className="cursor-pointer rounded border-b border-white/[0.06] px-1 pb-1 transition-colors last:border-0 hover:bg-white/[0.04]"
                title="双击查看详情"
                onDoubleClick={() => {
                  onSelectLogEntry({
                    time: entry.time,
                    request: JSON.stringify(
                      {
                        prompt: entry.prompt?.slice(0, 100),
                        model: entry.model,
                        width: entry.width,
                        height: entry.height,
                        batchSize: entry.batchSize,
                      },
                      null,
                      2,
                    ),
                    response:
                      entry.results && (entry.results as unknown[]).length > 0
                        ? `成功，返回 ${(entry.results as unknown[]).length} 张图`
                        : undefined,
                    error: entry.error,
                  })
                }}
              >
                <span className="text-slate-500">[{entry.time}]</span>
                {entry.model && (
                  <p className="mt-0.5 truncate text-[9px] text-primary-400">
                    → {entry.model} · {entry.width}×{entry.height}
                  </p>
                )}
                {entry.results && (entry.results as unknown[]).length > 0 && (
                  <p className="mt-0.5 text-emerald-400">
                    ✓ {(entry.results as unknown[]).length} 张
                  </p>
                )}
                {entry.error && (
                  <p className="mt-0.5 truncate text-red-400">✗ {entry.error.slice(0, 80)}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}

export default ControlPanel
