import React from 'react'
import type { MultiBalanceResult, BalanceErrorCode } from '../api/balance'

// ── 站点类型标签映射 ──────────────────────────────────────────────────────────

const SITE_TYPE_LABELS: Record<string, string> = {
  'one-api': 'One API',
  'new-api': 'New API',
  'one-hub': 'One Hub',
  'done-hub': 'Done Hub',
  'veloera': 'Veloera',
  'v-api': 'V-API',
  'vo-api': 'VoAPI',
  'super-api': 'Super-API',
  'sub2api': 'Sub2API',
  'aihubmix': 'AIHubMix',
  'custom': '自定义',
}

/** 错误码对应图标和建议 */
const ERROR_HINTS: Record<BalanceErrorCode, { icon: string; hint: string }> = {
  'no_base_url': { icon: '🔗', hint: '请先在设置中配置 API 地址' },
  'auth_failed': { icon: '🔑', hint: 'API Key 无效或已过期，请检查令牌配置' },
  'not_found': { icon: '🔍', hint: '端点不存在，请检查站点类型是否正确' },
  'html_response': { icon: '📄', hint: '服务器返回了网页，可能是地址配置错误' },
  'invalid_json': { icon: '📋', hint: '响应格式异常，请检查站点类型配置' },
  'api_error': { icon: '⚠️', hint: '接口返回错误，请检查配置或稍后重试' },
  'no_balance_field': { icon: '❓', hint: '无法解析余额字段，请检查站点类型' },
  'network_error': { icon: '🌐', hint: '网络连接失败，请检查网络或代理设置' },
  'timeout': { icon: '⏱️', hint: '请求超时，请检查网络连接' },
  'http_error': { icon: '🚫', hint: '服务器错误，请稍后重试' },
}

interface BalancePopupProps {
  open: boolean
  /** 新版：多站点结果 */
  multiResult?: MultiBalanceResult | null
  /** 旧版兼容：单一状态文字（仅无 multiResult 时使用） */
  balanceStatus?: 'ok' | 'idle' | 'loading' | 'fail'
  balanceMessage?: string
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  /** 刷新回调 */
  onRefresh?: () => void
}

const BalancePopup: React.FC<BalancePopupProps> = ({
  open,
  multiResult,
  balanceStatus,
  balanceMessage,
  buttonRef,
  onClose,
  onRefresh,
}) => {
  if (!open || !buttonRef.current) return null

  const rect = buttonRef.current.getBoundingClientRect()

  // ─── 新版多站点模式 ──────────────────────────────────────────────────────
  if (multiResult) {
    const { stations, totalUSD, totalCNY } = multiResult
    const allFailed = stations.every(s => !s.ok)
    const hasSome = stations.some(s => s.ok)

    return (
      <>
        <div className="fixed inset-0 z-[9998]" onClick={onClose} />
        <div
          className="glass-popup popup-enter fixed z-[9999] overflow-hidden rounded-xl"
          style={{
            left: Math.min(rect.left, window.innerWidth - 360),
            top: rect.bottom + 6,
            width: stations.length > 1 ? 380 : 320,
            maxHeight: 'calc(100vh - 80px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div
            className={`flex h-10 items-center justify-between px-4 ${
              hasSome
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                : 'bg-gradient-to-r from-red-400 to-rose-500'
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs font-bold text-white">
              {hasSome ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              令牌余额
              {stations.length > 1 && (
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {stations.length} 个站点
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {onRefresh && (
                <button
                  className="rounded p-0.5 text-sm text-white/60 hover:text-white"
                  onClick={onRefresh}
                  title="刷新"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              <button
                className="ml-1 rounded p-0.5 text-lg leading-none text-white/70 hover:text-white"
                onClick={onClose}
              >
                ×
              </button>
            </div>
          </div>

          {/* 内容区 */}
          <div className="app-scrollbar overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 150px)' }}>
            {/* 汇总行（多站点才显示） */}
            {stations.length > 1 && (totalUSD !== undefined) && (
              <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2">
                <div className="text-[10px] text-slate-400">合计余额</div>
                <div className="mt-0.5 text-lg font-bold text-emerald-400">
                  ${totalUSD!.toFixed(2)}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ≈ ¥{totalCNY!.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* 各站点卡片 */}
            <div className="space-y-2">
              {stations.map(station => {
                const errorCode = 'errorCode' in station ? station.errorCode as BalanceErrorCode : undefined
                const errorHint = errorCode ? ERROR_HINTS[errorCode] : undefined
                const siteTypeLabel = station.siteType ? SITE_TYPE_LABELS[station.siteType] || station.siteType : undefined

                return (
                  <div
                    key={station.configId}
                    className={`rounded-lg border p-2.5 ${
                      station.ok
                        ? station.isActive
                          ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
                          : 'border-white/[0.08] bg-white/[0.03]'
                        : 'border-red-500/20 bg-red-500/[0.05]'
                    }`}
                  >
                    {/* 站名行 */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          station.ok ? 'bg-emerald-400' : 'bg-red-400'
                        }`}
                      />
                      <span className="flex-1 truncate text-xs font-medium text-slate-200">
                        {station.name}
                      </span>
                      {/* 站点类型标签 */}
                      {siteTypeLabel && (
                        <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] text-slate-400">
                          {siteTypeLabel}
                        </span>
                      )}
                      {station.isActive && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-400">
                          当前
                        </span>
                      )}
                    </div>

                    {/* 备注 */}
                    {station.remark && (
                      <div className="mt-0.5 truncate pl-3 text-[10px] text-slate-500">
                        {station.remark}
                      </div>
                    )}

                    {/* 余额 / 错误 */}
                    {station.ok ? (
                      <div className="mt-1.5 pl-3">
                        {station.balanceUSD !== undefined ? (
                          <div>
                            <span className="text-sm font-semibold text-emerald-400">
                              ${station.balanceUSD.toFixed(2)}
                              {station.balanceCNY !== undefined && (
                                <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                                  ≈ ¥{station.balanceCNY.toFixed(2)}
                                </span>
                              )}
                            </span>
                            {/* 汇率来源 */}
                            {'exchangeRate' in station && station.exchangeRate && (
                              <div className="mt-0.5 text-[9px] text-slate-500">
                                汇率: {station.exchangeRate.toFixed(2)}{' '}
                                {'exchangeRateSource' in station && station.exchangeRateSource && (
                                  <span className="text-slate-600">
                                    ({station.exchangeRateSource})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-400">无法解析余额字段</span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1.5 pl-3">
                        <div className="text-[11px] leading-relaxed text-red-400">
                          {(station as { message: string }).message}
                        </div>
                        {errorHint && (
                          <div className="mt-1 text-[10px] text-slate-500">
                            {errorHint.icon} {errorHint.hint}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {allFailed && (
              <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[11px] leading-relaxed text-amber-400">
                💡 前往「设置 → 令牌余额」检查查询配置是否填写正确，确保站点类型匹配
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.06] px-3 py-1.5 text-right text-[10px] text-slate-500">
            点击空白处关闭
          </div>
        </div>
      </>
    )
  }

  // ─── 旧版兼容模式（无 multiResult 时） ──────────────────────────────────
  const isHtmlResponse = (balanceMessage ?? '').trim().startsWith('<')
  let balanceDisplay = ''
  let rawJsonDisplay = ''

  if (balanceStatus === 'ok' && !isHtmlResponse) {
    const lines = (balanceMessage ?? '').split('\n')
    if (lines[0]?.match(/^\$|^¥|^无法/)) {
      balanceDisplay = lines[0]
      rawJsonDisplay = lines.slice(2).join('\n')
    } else {
      rawJsonDisplay = balanceMessage ?? ''
    }
  }

  const displayMessageForHtml = isHtmlResponse
    ? '⚠️ 服务器返回了 HTML 页面而不是 JSON 数据。\n\n可能原因：\n1. 查询地址配置错误\n2. 端点路径不正确\n3. 服务器返回了错误页面\n\n请在设置 → 余额 中检查配置。'
    : balanceMessage

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="glass-popup popup-enter fixed z-[9999] w-80 overflow-hidden rounded-xl"
        style={{ left: rect.left, top: rect.bottom + 6 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className={`flex h-10 items-center justify-between px-4 ${
            balanceStatus === 'ok' && !isHtmlResponse
              ? 'bg-gradient-to-r from-green-500 to-emerald-500'
              : 'bg-gradient-to-r from-red-400 to-rose-500'
          }`}
        >
          <span className="text-xs font-bold text-white">
            {balanceStatus === 'ok' && !isHtmlResponse ? '✓ 余额查询成功' : '✗ 查询失败'}
          </span>
          <button className="text-lg leading-none text-white/80 hover:text-white" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-3">
          {balanceStatus === 'ok' && !isHtmlResponse ? (
            <div className="space-y-2">
              {balanceDisplay && (
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-400">{balanceDisplay}</div>
                  <div className="mt-1 text-[10px] text-slate-400">当前余额</div>
                </div>
              )}
              {rawJsonDisplay && (
                <pre className="app-scrollbar max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 font-mono text-[10px] text-slate-400">
                  {rawJsonDisplay}
                </pre>
              )}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-red-400">
              {displayMessageForHtml || '未知错误，请检查 API 设置'}
            </p>
          )}
          <div className="mt-2 text-right text-[10px] text-slate-500">点击空白处关闭</div>
        </div>
      </div>
    </>
  )
}

export default React.memo(BalancePopup)
