/**
 * ResultPanel — 生成结果展示区
 *
 * 从 App.tsx 提取的独立组件。
 * 展示生成结果、进度、缩略图、批量操作等。
 */
import React from 'react'
import type { GeneratedImage } from '../api/imageClient'
import { safeUrl } from '../utils/safeUrl'

interface Props {
  results: GeneratedImage[]
  setResults: React.Dispatch<React.SetStateAction<GeneratedImage[]>>
  resultActiveIdx: number
  setResultActiveIdx: (v: number | ((prev: number) => number)) => void
  selectedImageIds: Set<string>
  setSelectedImageIds: React.Dispatch<React.SetStateAction<Set<string>>>
  status: 'idle' | 'running'
  storeStatus: string
  elapsedSeconds: number
  progressPct: number
  lastDuration: string | null
  batchSize: number
  downloadStatus: 'idle' | 'downloading'
  toggleSelectAll: () => void
  handleBatchDownload: () => void
  setPreviewImage: (img: GeneratedImage | null) => void
}

const ResultPanel: React.FC<Props> = ({
  results,
  setResults,
  resultActiveIdx,
  setResultActiveIdx,
  selectedImageIds,
  setSelectedImageIds,
  status,
  storeStatus,
  elapsedSeconds,
  progressPct,
  lastDuration,
  batchSize,
  downloadStatus,
  toggleSelectAll,
  handleBatchDownload,
  setPreviewImage,
}) => {
  const safeIdx =
    results.length > 0 ? Math.min(Math.max(resultActiveIdx, 0), results.length - 1) : 0

  return (
    <section
      className={`glass-card workspace-panel panel-frame hud-panel future-glow flex min-w-[200px] flex-1 flex-col overflow-hidden ${status === 'running' ? 'generating-pulse' : ''}`}
    >
      {/* 标题栏 */}
      <div className="panel-titlebar hud-line relative flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span className="font-semibold">生成结果</span>
          {results.length > 0 && <span className="badge-primary">{results.length} 张</span>}
          {results.length > 0 && lastDuration && (
            <span className="badge-primary/60 font-mono text-slate-500">用时 {lastDuration}</span>
          )}
          {storeStatus === 'running' &&
            (() => {
              const mins = Math.floor(elapsedSeconds / 60)
              const secs = elapsedSeconds % 60
              return (
                <span className="badge-warning flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                  生成中 {mins > 0 ? `(${mins}分${secs}秒)` : `(${secs}秒)`}
                </span>
              )
            })()}
          {selectedImageIds.size > 0 && (
            <span className="badge-success">已选 {selectedImageIds.size}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {results.length > 0 && (
            <>
              <button
                onClick={toggleSelectAll}
                className="glass-button btn-hover-lift rounded-lg px-2.5 py-1 text-xs"
              >
                {selectedImageIds.size === results.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={handleBatchDownload}
                disabled={selectedImageIds.size === 0 || downloadStatus === 'downloading'}
                className="glass-button btn-hover-lift rounded-lg px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-30"
              >
                {downloadStatus === 'downloading' ? '下载中...' : '批量下载'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="app-scrollbar flex flex-1 items-center justify-center overflow-auto">
        {status === 'running' && results.length === 0 ? (
          /* 骨架屏 */
          <div className="grid h-full w-full grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: batchSize }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl">
                <div className="skeleton h-40 w-full" />
                <div className="space-y-1.5 p-2">
                  <div className="skeleton h-2.5 w-3/4" />
                  <div className="skeleton h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          /* 空状态 */
          <div className="flex h-full flex-col items-center justify-center px-8 py-12 text-slate-500">
            <div className="empty-placeholder group mb-6 flex h-52 w-72 cursor-default flex-col items-center justify-center rounded-[30px]">
              <div className="mb-5 grid grid-cols-3 gap-2 opacity-50">
                {[
                  'bg-purple-500/30',
                  'bg-blue-500/30',
                  'bg-pink-500/30',
                  'bg-amber-500/30',
                  'bg-emerald-500/30',
                  'bg-cyan-500/30',
                ].map((c, i) => (
                  <div key={i} className={`h-8 w-8 rounded-lg ${c}`} />
                ))}
              </div>
              <p className="text-xs font-medium text-slate-500">你的作品将在这里展示</p>
            </div>
            <p className="mb-1 text-sm font-medium text-slate-400">暂无生成结果</p>
            <p className="max-w-[220px] text-center text-xs leading-relaxed text-slate-400">
              在右侧输入提示词，
              <br />
              选择模型后点击「开始生图」
            </p>
          </div>
        ) : (
          (() => {
            const activeImg = results[safeIdx]
            const extendedImg = activeImg as typeof activeImg & { originalUrl?: string }
            const activeImgUrl = extendedImg.originalUrl || activeImg.url
            return (
              <div className="flex h-full w-full flex-col">
                {/* 主图区 */}
                <div
                  className="group relative flex-1 cursor-pointer overflow-hidden"
                  onClick={() => {
                    if (status !== 'running') setPreviewImage(activeImg)
                  }}
                >
                  <img
                    key={`main-${safeIdx}`}
                    src={activeImgUrl}
                    alt=""
                    className={`h-full w-full object-contain ${status === 'running' ? 'scale-105 opacity-40' : ''} transition-all duration-300`}
                    draggable={false}
                    onError={e => {
                      e.currentTarget.style.display = 'none'
                      const sibling = e.currentTarget.nextElementSibling as HTMLElement
                      if (sibling) sibling.style.display = 'flex'
                    }}
                  />
                  <div className="hidden h-full w-full items-center justify-center text-slate-400">
                    图片加载失败
                  </div>

                  {/* 生成中遮罩 */}
                  {status === 'running' && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
                      <div className="overlay-dark absolute inset-0 backdrop-blur-sm" />
                      <div className="relative z-10 flex w-full max-w-xs flex-col items-center gap-3 px-6">
                        <div className="flex items-center gap-2 text-white">
                          <svg
                            className="h-5 w-5 animate-spin text-amber-400"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
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
                          <span className="text-sm font-medium">生成中…</span>
                          <span className="ml-1 font-mono text-xs text-amber-300">
                            {Math.floor(elapsedSeconds / 60) > 0
                              ? `${Math.floor(elapsedSeconds / 60)}分${elapsedSeconds % 60}秒`
                              : `${elapsedSeconds}秒`}
                          </span>
                        </div>
                        <div className="w-full">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between">
                            <span className="text-[10px] text-amber-200">正在生成新图…</span>
                            <span className="font-mono text-[10px] text-amber-200">
                              {progressPct}%
                            </span>
                          </div>
                        </div>
                        <p className="text-center text-[10px] text-white/60">
                          旧图已保留，新图完成后自动切换
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 返回按钮 */}
                  <button
                    className="absolute left-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/80 text-white opacity-0 transition hover:bg-slate-600 group-hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation()
                      setResults([])
                      setResultActiveIdx(0)
                      setSelectedImageIds(new Set())
                    }}
                    title="返回默认界面"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                      />
                    </svg>
                  </button>

                  {/* 左右切换 */}
                  {results.length > 1 && (
                    <>
                      <button
                        className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                        onClick={e => {
                          e.stopPropagation()
                          setResultActiveIdx(i => (i - 1 + results.length) % results.length)
                        }}
                      >
                        ‹
                      </button>
                      <button
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                        onClick={e => {
                          e.stopPropagation()
                          setResultActiveIdx(i => (i + 1) % results.length)
                        }}
                      >
                        ›
                      </button>
                      <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                        {safeIdx + 1} / {results.length}
                      </div>
                    </>
                  )}
                </div>

                {/* 缩略图横条 */}
                {results.length > 1 && (
                  <div className="app-scrollbar flex flex-shrink-0 gap-1.5 overflow-x-auto border-t border-white/[0.06] px-2 py-2">
                    {results.map((img, idx) => {
                      const extImg = img as typeof img & { originalUrl?: string }
                      const thumbUrl = img.url || extImg.originalUrl
                      return (
                        <div key={img.id} className="relative flex-shrink-0">
                          <button
                            onClick={() => setResultActiveIdx(idx)}
                            className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition-all ${idx === safeIdx ? 'border-primary-400 ring-1 ring-primary-400/30' : 'border-transparent hover:border-white/20'}`}
                          >
                            <img
                              src={safeUrl(thumbUrl)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()
        )}
      </div>
    </section>
  )
}

export default ResultPanel
