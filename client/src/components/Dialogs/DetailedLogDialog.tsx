import React from "react";
import { useUiStore } from "../../store/uiStore";

const DetailedLogDialog: React.FC = () => {
  const showDetailedLog = useUiStore((s) => s.showDetailedLog);
  const selectedLogEntry = useUiStore((s) => s.selectedLogEntry);
  const setShowDetailedLog = useUiStore((s) => s.setShowDetailedLog);
  const setSelectedLogEntry = useUiStore((s) => s.setSelectedLogEntry);
  const logEntries = useUiStore((s) => s.logEntries);
  const setLogEntries = useUiStore((s) => s.setLogEntries);

  if (!showDetailedLog) return null;

  // 显示单条选中的日志；无选中时降级显示 logEntries 列表
  const displayEntries: typeof logEntries = selectedLogEntry ? [selectedLogEntry] : logEntries;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overlay-dark"
      onClick={() => { setShowDetailedLog(false); setSelectedLogEntry(null); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[82vh] flex flex-col overflow-hidden popup-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="h-13 bg-gradient-to-r from-slate-600 to-slate-700 flex items-center justify-between px-5 flex-shrink-0 py-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-sm font-bold text-white">详细日志</h2>
            {selectedLogEntry && (
              <span className="text-[11px] text-white/50 font-normal ml-1">
                单条详情
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {displayEntries.length > 0 && !selectedLogEntry && (
              <button
                type="button"
                title="清空全部日志"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-red-500/80 text-white/70 hover:text-white text-[11px] transition-colors"
                onClick={() => {
                  setLogEntries([]);
                  setShowDetailedLog(false);
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                清空
              </button>
            )}
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-lg leading-none transition-colors"
              onClick={() => { setShowDetailedLog(false); setSelectedLogEntry(null); }}
            >
              ×
            </button>
          </div>
        </div>

        {/* 日志列表 */}
        <div className="flex-1 overflow-y-auto app-scrollbar p-4">
          {displayEntries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">暂无日志记录</p>
          ) : (
            <div className="space-y-2.5">
              {displayEntries.map((entry, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-3 border group relative ${
                    entry.error
                      ? "bg-red-50 border-red-200"
                      : entry.response
                      ? "bg-green-50 border-green-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  {/* 条目头部 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">[{entry.time}]</span>
                      {entry.error ? (
                        <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                          错误
                        </span>
                      ) : entry.response ? (
                        <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                          成功
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-blue-500 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                          请求中
                        </span>
                      )}
                    </div>
                    {/* 删除单条 */}
                    <button
                      type="button"
                      title="删除此条日志"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 text-slate-300 hover:text-red-500 transition-all"
                      onClick={() =>
                        setLogEntries((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Request Summary */}
                  {entry.request && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        Request Summary
                      </div>
                      <pre className="text-xs bg-white/80 border border-slate-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-slate-600">
                        {entry.request}
                      </pre>
                    </div>
                  )}

                  {/* 完整请求详情 */}
                  {(entry.endpoint || entry.requestBody) && (
                    <div className="mb-2 space-y-1.5">
                      {entry.endpoint && (
                        <div>
                          <div className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider mb-1">
                            Endpoint
                            {entry.spec && (
                              <span className="ml-2 normal-case font-normal text-indigo-400">
                                ({entry.spec === "gemini" ? "Gemini 规范" : "OpenAI 规范"})
                              </span>
                            )}
                            {entry.httpStatus && (
                              <span className="ml-2 normal-case font-normal text-slate-400">
                                HTTP {entry.httpStatus}
                              </span>
                            )}
                            {entry.jsonValid === false && (
                              <span className="ml-2 normal-case font-normal text-amber-500">
                                ⚠️ 非JSON格式
                              </span>
                            )}
                          </div>
                          <div className="text-xs bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-2 font-mono text-indigo-700 break-all">
                            {entry.endpoint}
                          </div>
                        </div>
                      )}
                      {entry.requestBody && (
                        <div>
                          <div className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">
                            Request Body (Full)
                          </div>
                          <pre className="text-xs bg-blue-50 border border-blue-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-blue-700 max-h-48">
                            {entry.requestBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 响应内容 */}
                  {entry.response && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1">
                        Response
                      </div>
                      <pre className="text-xs bg-white/80 border border-green-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-green-700">
                        {entry.response}
                      </pre>
                    </div>
                  )}

                  {/* 完整响应体 */}
                  {entry.responseBody && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-1">
                        Response Body (Full)
                      </div>
                      <pre className="text-xs bg-teal-50 border border-teal-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-teal-700 max-h-64">
                        {entry.responseBody}
                      </pre>
                    </div>
                  )}

                  {/* 错误内容 */}
                  {entry.error && (
                    <div>
                      <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">
                        Error
                      </div>
                      <pre className="text-xs bg-white/80 border border-red-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-red-600">
                        {entry.error}
                      </pre>
                      {entry.httpErrorBody && (
                        <div className="mt-1.5">
                          <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">
                            HTTP Error Body
                          </div>
                          <pre className="text-xs bg-red-50 border border-red-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-red-500">
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
  );
};

export default React.memo(DetailedLogDialog);
