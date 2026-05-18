import React from 'react'
import { useUiStore } from '../../store/uiStore'

const DetailedLogDialog: React.FC = () => {
  const showDetailedLog = useUiStore(s => s.showDetailedLog)
  const selectedLogEntry = useUiStore(s => s.selectedLogEntry)
  const setShowDetailedLog = useUiStore(s => s.setShowDetailedLog)
  const setSelectedLogEntry = useUiStore(s => s.setSelectedLogEntry)
  const logEntries = useUiStore(s => s.logEntries)
  const setLogEntries = useUiStore(s => s.setLogEntries)

  if (!showDetailedLog) return null

  // 显示单条选中的日志；无选中时降级显示 logEntries 列表
  const displayEntries: typeof logEntries = selectedLogEntry ? [selectedLogEntry] : logEntries

  return (
    <div
      className="overlay-dark fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => {
        setShowDetailedLog(false)
        setSelectedLogEntry(null)
      }}
    >
      <div
        className="popup-enter flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white/[0.06] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="h-13 flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-slate-600 to-slate-700 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-white/80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h2 className="text-sm font-bold text-white">详细日志</h2>
            {selectedLogEntry && (
              <span className="ml-1 text-[11px] font-normal text-white/50">单条详情</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {displayEntries.length > 0 && !selectedLogEntry && (
              <button
                type="button"
                title="清空全部日志"
                className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:bg-red-500/80 hover:text-white"
                onClick={() => {
                  setLogEntries([])
                  setShowDetailedLog(false)
                }}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                清空
              </button>
            )}
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-lg leading-none text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              onClick={() => {
                setShowDetailedLog(false)
                setSelectedLogEntry(null)
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* 日志列表 */}
        <div className="app-scrollbar flex-1 overflow-y-auto p-4">
          {displayEntries.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">暂无日志记录</p>
          ) : (
            <div className="space-y-2.5">
              {displayEntries.map((entry, i) => (
                <div
                  key={i}
                  className={`group relative rounded-xl border p-3 ${
                    entry.error
                      ? 'border-red-500/20 bg-red-500/10'
                      : entry.response
                        ? 'border-emerald-500/20 bg-emerald-500/10'
                        : 'border-white/[0.08] bg-white/[0.04]'
                  }`}
                >
                  {/* 条目头部 */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">[{entry.time}]</span>
                      {entry.error ? (
                        <span className="inline-flex items-center gap-1 font-medium text-red-500">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                          错误
                        </span>
                      ) : entry.response ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                          成功
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-blue-500">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                          请求中
                        </span>
                      )}
                    </div>
                    {/* 删除单条 */}
                    <button
                      type="button"
                      title="删除此条日志"
                      className="rounded p-1 text-slate-300 opacity-0 transition-all hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
                      onClick={() => setLogEntries(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <svg
                        className="h-3.5 w-3.5"
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

                  {/* Request Summary */}
                  {entry.request && (
                    <div className="mb-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Request Summary
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-slate-800/60 p-2.5 font-mono text-xs text-slate-300">
                        {entry.request}
                      </pre>
                    </div>
                  )}

                  {/* 完整请求详情 */}
                  {(entry.endpoint || entry.requestBody) && (
                    <div className="mb-2 space-y-1.5">
                      {entry.endpoint && (
                        <div>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                            Endpoint
                            {entry.spec && (
                              <span className="ml-2 font-normal normal-case text-indigo-300">
                                ({entry.spec === 'gemini' ? 'Gemini 规范' : 'OpenAI 规范'})
                              </span>
                            )}
                            {entry.httpStatus && (
                              <span className="ml-2 font-normal normal-case text-slate-400">
                                HTTP {entry.httpStatus}
                              </span>
                            )}
                            {entry.jsonValid === false && (
                              <span className="ml-2 font-normal normal-case text-amber-400">
                                ⚠️ 非JSON格式
                              </span>
                            )}
                          </div>
                          <div className="break-all rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-2 font-mono text-xs text-indigo-300">
                            {entry.endpoint}
                          </div>
                        </div>
                      )}
                      {entry.requestBody && (
                        <div>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                            Request Body (Full)
                          </div>
                          <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5 font-mono text-xs text-blue-300">
                            {entry.requestBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 响应内容 */}
                  {entry.response && (
                    <div className="mb-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                        Response
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 font-mono text-xs text-emerald-300">
                        {entry.response}
                      </pre>
                    </div>
                  )}

                  {/* 完整响应体 */}
                  {entry.responseBody && (
                    <div className="mb-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-teal-400">
                        Response Body (Full)
                      </div>
                      <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-teal-500/20 bg-teal-500/10 p-2.5 font-mono text-xs text-teal-300">
                        {entry.responseBody}
                      </pre>
                    </div>
                  )}

                  {/* 错误内容 */}
                  {entry.error && (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                        Error
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 font-mono text-xs text-red-300">
                        {entry.error}
                      </pre>
                      {entry.httpErrorBody && (
                        <div className="mt-1.5">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                            HTTP Error Body
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 font-mono text-xs text-red-300">
                            {entry.httpErrorBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(DetailedLogDialog)
