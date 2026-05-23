/**
 * SettingsDialog — 设置弹窗组件
 *
 * 包含：Global Config（供应商名称/BaseURL/API Key）、供应商管理入口、
 * Image/Chat 模型列表、自动获取模型、模型选择弹窗、测试连接。
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  getApiConfig,
  saveApiConfig,
  addApiVendor,
  switchApiVendor,
  saveBalanceTemplate,
  type ApiConfig,
  type ImageModel,
  type ChatModel,
  type ApiSpec,
  type BalanceTemplate,
  type BalanceConfig,
} from '../api/settings'
import { buildBalanceTestRequest, getSitePresets, proxyFetch } from '../api/balance'
import { testChatModel, testImageModel } from '../api/modelConfig'
import VendorManager from './VendorManager'

// ── 内联 API 函数 ──────────────────────────────────────────────────────────
async function fetchModelList(
  baseUrl: string,
  apiKey: string,
  apiSpec?: string,
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const base = baseUrl.replace(/\/+$/, '')
    if (!base) return { ok: false, models: [], error: '请先填写 Base URL' }

    if (apiSpec === 'gemini') {
      // Gemini: GET /v1beta/models
      const url = `${base}/v1beta/models`
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (apiKey?.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
      if (!resp.ok) return { ok: false, models: [], error: `HTTP ${resp.status}` }
      const data = (await resp.json()) as { models?: Array<{ name?: string }> }
      const models = Array.isArray(data?.models)
        ? data.models.map(m => m.name?.replace(/^models\//, '') ?? '').filter(Boolean)
        : []
      return {
        ok: models.length > 0,
        models,
        error: models.length === 0 ? '未获取到模型' : undefined,
      }
    }

    // OpenAI: GET /v1/models
    const url = base + '/v1/models'
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (apiKey?.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    if (!resp.ok) return { ok: false, models: [], error: `HTTP ${resp.status}` }
    const data = (await resp.json()) as { data?: Array<{ id: string }> }
    const models = Array.isArray(data?.data) ? data.data.map(m => m.id).filter(Boolean) : []
    return {
      ok: models.length > 0,
      models,
      error: models.length === 0 ? '未获取到模型' : undefined,
    }
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : '网络错误' }
  }
}

// ── 组件 ──────────────────────────────────────────────────────────────────
interface Props {
  open: boolean
  onClose: () => void
  onSave: (modelIds: string[], activeModelId: string) => void
}

const SettingsDialog: React.FC<Props> = ({ open, onClose, onSave }) => {
  const [cfgDraft, setCfgDraft] = useState<ApiConfig>(() => getApiConfig())
  const [settingsTab, setSettingsTab] = useState<'image' | 'chat' | 'balance'>('image')
  const [modelTestStatus, setModelTestStatus] = useState<
    Record<string, 'idle' | 'testing' | 'ok' | 'fail'>
  >({})
  const [modelTestMsg, setModelTestMsg] = useState<Record<string, string>>({})
  const [balanceTestStatus, setBalanceTestStatus] = useState<
    Record<string, 'idle' | 'testing' | 'ok' | 'fail'>
  >({})
  const [balanceTestMsg, setBalanceTestMsg] = useState<Record<string, string>>({})
  const [balanceTestResultVisible, setBalanceTestResultVisible] = useState<Record<string, boolean>>(
    {},
  )
  const [syncToast, setSyncToast] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState('')
  const [globalSaveVendorName, setGlobalSaveVendorName] = useState('')
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false)
  const [balanceDropdownOpen, setBalanceDropdownOpen] = useState(false)
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const balanceDropdownRef = useRef<HTMLDivElement>(null)

  // 供应商管理弹窗
  const [vendorManagerOpen, setVendorManagerOpen] = useState(false)

  // 模型选择弹窗（获取模型列表后弹出）
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelPickerMode, setModelPickerMode] = useState<'image' | 'chat'>('image')
  const [modelPickerList, setModelPickerList] = useState<string[]>([])
  const [modelPickerSelected, setModelPickerSelected] = useState<Set<string>>(new Set())
  const [modelPickerSearch, setModelPickerSearch] = useState('')

  useEffect(() => {
    if (open) {
      setCfgDraft(getApiConfig())
      setModelTestStatus({})
      setModelTestMsg({})
      setFetchErr('')
      setModelPickerOpen(false)
      setBalanceTestResultVisible({})
    }
  }, [open])

  // 余额配置下拉面板：点击外部关闭
  useEffect(() => {
    if (!balanceDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (balanceDropdownRef.current && !balanceDropdownRef.current.contains(e.target as Node)) {
        setBalanceDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [balanceDropdownOpen])

  if (!open) return null

  const handleSave = () => {
    saveApiConfig(cfgDraft)
    const imgModelIds = cfgDraft.imageModels.map(m => m.modelId).filter(Boolean)
    if (imgModelIds.length > 0) {
      const activeM = cfgDraft.imageModels.find(m => m.id === cfgDraft.activeImageModelId)
      const activeMid = activeM?.modelId?.trim() || imgModelIds[0]
      onSave(imgModelIds, activeMid)
    } else {
      onSave([], '')
    }
    onClose()
  }

  const handleFetchModels = async (mode: 'image' | 'chat' = 'image') => {
    setFetching(true)
    setFetchErr('')
    try {
      const baseUrl = cfgDraft.globalBaseUrl
      const apiKey = cfgDraft.globalApiKey
      if (!baseUrl.trim()) {
        setFetchErr('请先填写 Base URL')
        return
      }
      const result = await fetchModelList(baseUrl, apiKey, cfgDraft.globalApiSpec)
      if (result.ok && result.models.length > 0) {
        setModelPickerMode(mode)
        setModelPickerList(result.models)
        // 默认全选
        setModelPickerSelected(new Set(result.models))
        setModelPickerSearch('')
        setModelPickerOpen(true)
      } else {
        setFetchErr(result.error || '获取模型列表失败')
      }
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : '网络错误')
    } finally {
      setFetching(false)
    }
  }

  const testBalanceConfig = async (configId: string) => {
    const config = cfgDraft.balanceConfigs?.find(c => c.id === configId)
    if (!config) return

    setBalanceTestStatus(prev => ({ ...prev, [configId]: 'testing' }))
    setBalanceTestMsg(prev => ({ ...prev, [configId]: '' }))
    setBalanceTestResultVisible(prev => ({ ...prev, [configId]: false }))

    try {
      const { endpoint, method, headers, body } = buildBalanceTestRequest(config)

      // 使用 proxyFetch（Electron 主进程或 Vite 开发代理绕过 CORS）
      const result = await proxyFetch(endpoint, {
        method,
        headers,
        body,
        timeout: 15000,
      })

      if (result.error) {
        setBalanceTestStatus(prev => ({ ...prev, [configId]: 'fail' }))
        setBalanceTestMsg(prev => ({ ...prev, [configId]: `✗ 请求失败\n\n${result.error}` }))
        setBalanceTestResultVisible(prev => ({ ...prev, [configId]: true }))
        return
      }

      const preview =
        typeof result.data === 'string'
          ? (result.data as string).slice(0, 150)
          : JSON.stringify(result.data).slice(0, 150)

      if (result.ok) {
        setBalanceTestStatus(prev => ({ ...prev, [configId]: 'ok' }))
        setBalanceTestMsg(prev => ({
          ...prev,
          [configId]: `✓ HTTP ${result.status} 成功\n\n响应预览:\n${preview}`,
        }))
      } else {
        setBalanceTestStatus(prev => ({ ...prev, [configId]: 'fail' }))
        setBalanceTestMsg(prev => ({
          ...prev,
          [configId]: `✗ HTTP ${result.status} ${result.statusText}\n\n响应预览:\n${preview}`,
        }))
      }
      setBalanceTestResultVisible(prev => ({ ...prev, [configId]: true }))
    } catch (err) {
      setBalanceTestStatus(prev => ({ ...prev, [configId]: 'fail' }))
      const errMsg = err instanceof Error ? err.message : String(err)
      setBalanceTestMsg(prev => ({ ...prev, [configId]: `✗ 请求失败\n\n${errMsg}` }))
      setBalanceTestResultVisible(prev => ({ ...prev, [configId]: true }))
    }
  }

  const handleModelPickerConfirm = () => {
    const selectedModels = modelPickerList.filter(m => modelPickerSelected.has(m))
    if (modelPickerMode === 'image') {
      const newModels: ImageModel[] = selectedModels.map(mid => ({
        id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${Math.random().toString(36).slice(2, 4)}`,
        modelId: mid,
        label: mid,
        baseUrl: '',
        apiKey: '',
        apiSpec: undefined as ApiSpec | undefined,
      }))
      setCfgDraft(prev => {
        const existingIds = new Set(prev.imageModels.map(m => m.modelId))
        const toAdd = newModels.filter(nm => !existingIds.has(nm.modelId))
        return { ...prev, imageModels: [...prev.imageModels, ...toAdd] }
      })
    } else {
      const newModels: ChatModel[] = selectedModels.map(mid => ({
        id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${Math.random().toString(36).slice(2, 4)}`,
        modelId: mid,
        label: mid,
        baseUrl: '',
        apiKey: '',
      }))
      setCfgDraft(prev => {
        const existingIds = new Set(prev.chatModels.map(m => m.modelId))
        const toAdd = newModels.filter(nm => !existingIds.has(nm.modelId))
        return { ...prev, chatModels: [...prev.chatModels, ...toAdd] }
      })
    }
    setModelPickerOpen(false)
  }

  const updateModel = (id: string, patch: Partial<ImageModel>) => {
    setCfgDraft(prev => ({
      ...prev,
      imageModels: prev.imageModels.map(m => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }

  const removeModel = (id: string) => {
    setCfgDraft(prev => ({
      ...prev,
      imageModels: prev.imageModels.filter(m => m.id !== id),
    }))
  }

  const updateChatModel = (id: string, patch: Partial<ChatModel>) => {
    setCfgDraft(prev => ({
      ...prev,
      chatModels: prev.chatModels.map(m => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }

  const removeChatModel = (id: string) => {
    setCfgDraft(prev => ({
      ...prev,
      chatModels: prev.chatModels.filter(m => m.id !== id),
    }))
  }

  const addChatModel = () => {
    const newModel: ChatModel = {
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      modelId: '',
      label: '',
      baseUrl: '',
      apiKey: '',
    }
    setCfgDraft(prev => ({
      ...prev,
      chatModels: [...prev.chatModels, newModel],
    }))
  }

  const addModel = () => {
    const newModel: ImageModel = {
      id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      modelId: '',
      label: '',
      baseUrl: '',
      apiKey: '',
      apiSpec: undefined as ApiSpec | undefined,
    }
    setCfgDraft(prev => ({
      ...prev,
      imageModels: [...prev.imageModels, newModel],
    }))
  }

  // 模型选择弹窗过滤
  const filteredPickerModels = modelPickerSearch.trim()
    ? modelPickerList.filter(m => m.toLowerCase().includes(modelPickerSearch.toLowerCase()))
    : modelPickerList

  return (
    <>
      {/* ── 主设置弹窗 ── */}
      <div
        className="overlay-dark fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="glass-popup popup-enter relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex flex-shrink-0 items-center justify-between px-6 pb-0 pt-5">
            <div>
              <h2 className="text-base font-bold text-slate-100">模型接口配置</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                严格遵循 OpenAI API 格式，仅替换 BASE URL 和 API KEY 即可完成对接
              </p>
            </div>
            <button
              className="ml-4 rounded-lg p-1 text-xl leading-none text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
              onClick={onClose}
              aria-label="关闭设置"
            >
              ×
            </button>
          </div>

          {/* 全局配置区 */}
          <div className="flex-shrink-0 border-b border-white/[0.06] px-6 pb-3 pt-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Global Config
              </span>
              <span className="ml-1 hidden text-[10px] text-slate-400 sm:inline">
                — 所有模型默认继承
              </span>
              {/* 供应商管理按钮 */}
              <button
                type="button"
                className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-400 transition hover:bg-indigo-500/15"
                onClick={() => setVendorManagerOpen(true)}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                供应商管理
                {cfgDraft.apiVendors?.length > 0 && (
                  <span className="rounded bg-indigo-500/15 px-1 text-[9px] text-indigo-400">
                    {cfgDraft.apiVendors.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* 供应商名称 */}
              <div className="relative flex-shrink-0" style={{ width: 150 }}>
                <input
                  type="text"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 pr-7 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="供应商名称"
                  value={globalSaveVendorName}
                  onChange={e => setGlobalSaveVendorName(e.target.value)}
                  onFocus={() => cfgDraft.apiVendors?.length > 0 && setVendorDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 150)}
                />
                {cfgDraft.apiVendors?.length > 0 && (
                  <svg
                    className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500"
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
                )}
                {vendorDropdownOpen && cfgDraft.apiVendors?.length > 0 && (
                  <div className="glass-popup absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/[0.08] shadow-xl">
                    <div className="border-b border-white/[0.06] px-2 py-1">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500">
                        已保存的供应商（点击切换）
                      </span>
                    </div>
                    {cfgDraft.apiVendors.map(v => {
                      const isActive = cfgDraft.activeVendorId === v.id
                      return (
                        <button
                          key={v.id}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                            isActive
                              ? 'bg-primary-500/10 text-primary-400'
                              : 'text-slate-300 hover:bg-white/[0.06]'
                          }`}
                          onMouseDown={e => {
                            e.preventDefault()
                            const updated = switchApiVendor(v.id)
                            setGlobalSaveVendorName(v.name)
                            setCfgDraft(prev => {
                              // 自动匹配与当前供应商对应的余额配置
                              const matchedBalance = prev.balanceConfigs?.find(
                                b =>
                                  b.baseUrl === v.baseUrl ||
                                  b.name === v.name ||
                                  b.remark === v.name,
                              )
                              return {
                                ...prev,
                                globalBaseUrl: v.baseUrl,
                                globalApiKey: v.apiKey || '',
                                activeVendorId: v.id,
                                apiVendors: updated.apiVendors,
                                activeBalanceConfigId:
                                  matchedBalance?.id || prev.activeBalanceConfigId,
                              }
                            })
                            setVendorDropdownOpen(false)
                          }}
                        >
                          {isActive && <span className="text-[9px]">✓</span>}
                          <span className="flex-1 truncate">{v.name}</span>
                          <span className="max-w-[120px] truncate font-mono text-[9px] text-slate-500">
                            {v.baseUrl}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Base URL */}
              <input
                type="text"
                className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Base URL（如 https://api.openai.com）"
                value={cfgDraft.globalBaseUrl}
                onChange={e => setCfgDraft(prev => ({ ...prev, globalBaseUrl: e.target.value }))}
              />

              {/* API Key */}
              <input
                type="password"
                className="w-40 flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="API Key"
                value={cfgDraft.globalApiKey}
                onChange={e => setCfgDraft(prev => ({ ...prev, globalApiKey: e.target.value }))}
              />

              {/* 同步按钮 */}
              <button
                type="button"
                className="flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.08]"
                onClick={() => {
                  setCfgDraft(prev => ({
                    ...prev,
                    imageModels: prev.imageModels.map(m => ({
                      ...m,
                      baseUrl: m.baseUrl?.trim() ? m.baseUrl : prev.globalBaseUrl,
                      apiKey: m.apiKey?.trim() ? m.apiKey : prev.globalApiKey,
                    })),
                  }))
                  setSyncToast(true)
                  setTimeout(() => setSyncToast(false), 2000)
                }}
                title="将 Global Config 同步到所有模型（仅未自定义的字段）"
              >
                同步
              </button>

              {/* 保存为供应商 */}
              <button
                type="button"
                className="flex-shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-400 transition hover:bg-emerald-500/15"
                onClick={() => {
                  const name =
                    globalSaveVendorName.trim() ||
                    cfgDraft.globalBaseUrl.replace(/^https?:\/\//, '').split('/')[0] ||
                    '未命名供应商'
                  if (!cfgDraft.globalBaseUrl.trim()) return
                  const updated = addApiVendor({
                    name,
                    baseUrl: cfgDraft.globalBaseUrl.trim(),
                    apiKey: cfgDraft.globalApiKey.trim() || undefined,
                  })
                  setCfgDraft(prev => ({ ...prev, apiVendors: updated.apiVendors }))
                  setGlobalSaveVendorName('')
                  setSyncToast(true)
                  setTimeout(() => setSyncToast(false), 2000)
                }}
                disabled={!cfgDraft.globalBaseUrl.trim()}
                title="将当前 Base URL 和 API Key 保存为供应商"
              >
                保存为供应商
              </button>
            </div>
            {syncToast && <p className="mt-1 text-[10px] text-emerald-400">✓ 已同步到所有模型</p>}
          </div>

          {/* 标签页切换 */}
          <div className="flex flex-shrink-0 border-b border-white/[0.06] px-6">
            {(['image', 'chat', 'balance'] as const).map(tab => (
              <button
                key={tab}
                className={`border-b-2 px-4 py-2.5 text-xs font-medium transition ${
                  settingsTab === tab
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
                onClick={() => setSettingsTab(tab)}
              >
                {tab === 'image' ? 'Image 模型' : tab === 'chat' ? 'Chat 模型' : '令牌余额'}
              </button>
            ))}
          </div>

          {/* 模型列表 */}
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            {settingsTab === 'image' && (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      共 {cfgDraft.imageModels.length} 个模型
                    </span>
                    <button
                      type="button"
                      className="rounded-lg bg-primary-500/10 px-2 py-1 text-[11px] text-primary-400 transition hover:bg-primary-500/20"
                      onClick={() => handleFetchModels('image')}
                      disabled={fetching}
                    >
                      {fetching ? '获取中…' : '自动获取模型'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-white/[0.04] px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/[0.08]"
                    onClick={addModel}
                  >
                    + 手动添加
                  </button>
                </div>
                {fetchErr && <p className="mb-2 text-[10px] text-red-400">{fetchErr}</p>}

                {cfgDraft.imageModels.map(m => {
                  const ts = modelTestStatus[m.id] || 'idle'
                  const tmsg = modelTestMsg[m.id] || ''
                  return (
                    <div key={m.id} className="glass-card space-y-2 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="Model ID（如 gpt-image-1）"
                          value={m.modelId}
                          onChange={e => updateModel(m.id, { modelId: e.target.value })}
                        />
                        <input
                          type="text"
                          className="w-24 flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="别名"
                          value={m.label || ''}
                          onChange={e => updateModel(m.id, { label: e.target.value })}
                        />
                        {/* API 规范选择 */}
                        <select
                          className="w-20 flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.06] px-1.5 py-1.5 text-[11px] text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                          value={m.apiSpec || ''}
                          onChange={e =>
                            updateModel(m.id, {
                              apiSpec: (e.target.value || undefined) as ApiSpec | undefined,
                            })
                          }
                          title="API 规范（留空自动检测）"
                        >
                          <option value="">自动</option>
                          <option value="openai">OpenAI</option>
                          <option value="gemini">Gemini</option>
                        </select>
                        <button
                          type="button"
                          className="flex-shrink-0 rounded p-1 text-sm text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                          onClick={() => removeModel(m.id)}
                          title="删除此模型"
                        >
                          ×
                        </button>
                      </div>

                      {/* 模型级 BaseUrl / ApiKey */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="Base URL（留空继承全局）"
                          value={m.baseUrl || ''}
                          onChange={e => updateModel(m.id, { baseUrl: e.target.value })}
                        />
                        <input
                          type="password"
                          className="w-36 flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="API Key（留空继承全局）"
                          value={m.apiKey || ''}
                          onChange={e => updateModel(m.id, { apiKey: e.target.value })}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary-500"
                            checked={Boolean(m.supportsInpaint)}
                            onChange={e => updateModel(m.id, { supportsInpaint: e.target.checked })}
                          />
                          支持局部重绘
                        </label>
                        <span
                          className="hidden text-[10px] text-slate-500 lg:inline"
                          title="需要 OpenAI 兼容 /v1/images/edits multipart 接口；Gemini generateContent 不支持严格蒙版局部重绘。"
                        >
                          需兼容 /v1/images/edits
                        </span>
                        <input
                          type="text"
                          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="Inpaint Endpoint（留空默认 /v1/images/edits）"
                          value={m.inpaintEndpoint || ''}
                          onChange={e => updateModel(m.id, { inpaintEndpoint: e.target.value })}
                        />
                      </div>

                      {/* 测试连接 */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] transition ${
                            ts === 'ok'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : ts === 'fail'
                                ? 'bg-red-500/10 text-red-400'
                                : ts === 'testing'
                                  ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
                          }`}
                          disabled={ts === 'testing'}
                          onClick={async () => {
                            setModelTestStatus(s => ({ ...s, [m.id]: 'testing' }))
                            setModelTestMsg(s => ({ ...s, [m.id]: '' }))
                            const result = await testImageModel(m, {
                              globalBaseUrl: cfgDraft.globalBaseUrl,
                              globalApiKey: cfgDraft.globalApiKey,
                              globalApiSpec: cfgDraft.globalApiSpec,
                            })
                            setModelTestStatus(s => ({ ...s, [m.id]: result.ok ? 'ok' : 'fail' }))
                            setModelTestMsg(s => ({
                              ...s,
                              [m.id]:
                                result.message +
                                (result.ok
                                  ? ''
                                  : 'detail' in result && result.detail
                                    ? `\n${result.detail}`
                                    : ''),
                            }))
                          }}
                        >
                          {ts === 'testing' ? (
                            <>
                              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
                              测试中…
                            </>
                          ) : ts === 'ok' ? (
                            <>
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
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              联通
                            </>
                          ) : ts === 'fail' ? (
                            <>
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
                              失败
                            </>
                          ) : (
                            <>
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
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              测试连接
                            </>
                          )}
                        </button>
                      </div>
                      {tmsg && (
                        <div
                          className={`mt-2 whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed ${
                            ts === 'ok'
                              ? 'border border-emerald-500/15 bg-emerald-500/10 text-emerald-400'
                              : 'border border-red-500/15 bg-red-500/10 text-red-400'
                          }`}
                        >
                          {tmsg}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}

            {settingsTab === 'chat' && (
              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      共 {cfgDraft.chatModels.length} 个模型
                    </span>
                    <button
                      type="button"
                      className="rounded-lg bg-primary-500/10 px-2 py-1 text-[11px] text-primary-400 transition hover:bg-primary-500/20"
                      onClick={() => handleFetchModels('chat')}
                      disabled={fetching}
                    >
                      {fetching ? '获取中…' : '自动获取模型'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-white/[0.04] px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/[0.08]"
                    onClick={addChatModel}
                  >
                    + 手动添加
                  </button>
                </div>
                {fetchErr && <p className="mb-2 text-[10px] text-red-400">{fetchErr}</p>}

                {cfgDraft.chatModels.map(m => {
                  const ts = modelTestStatus[m.id] || 'idle'
                  const tmsg = modelTestMsg[m.id] || ''
                  return (
                    <div key={m.id} className="glass-card space-y-2 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="Model ID（如 gpt-4o）"
                          value={m.modelId}
                          onChange={e => updateChatModel(m.id, { modelId: e.target.value })}
                        />
                        <input
                          type="text"
                          className="w-24 flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="别名"
                          value={m.label || ''}
                          onChange={e => updateChatModel(m.id, { label: e.target.value })}
                        />
                        <button
                          type="button"
                          className="flex-shrink-0 rounded p-1 text-sm text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                          onClick={() => removeChatModel(m.id)}
                          title="删除此模型"
                        >
                          ×
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="Base URL（留空继承全局）"
                          value={m.baseUrl || ''}
                          onChange={e => updateChatModel(m.id, { baseUrl: e.target.value })}
                        />
                        <input
                          type="password"
                          className="w-36 flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          placeholder="API Key（留空继承全局）"
                          value={m.apiKey || ''}
                          onChange={e => updateChatModel(m.id, { apiKey: e.target.value })}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] transition ${
                            ts === 'ok'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : ts === 'fail'
                                ? 'bg-red-500/10 text-red-400'
                                : ts === 'testing'
                                  ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
                          }`}
                          disabled={ts === 'testing'}
                          onClick={async () => {
                            setModelTestStatus(s => ({ ...s, [m.id]: 'testing' }))
                            setModelTestMsg(s => ({ ...s, [m.id]: '' }))
                            const result = await testChatModel(m, {
                              globalBaseUrl: cfgDraft.globalBaseUrl,
                              globalApiKey: cfgDraft.globalApiKey,
                            })
                            setModelTestStatus(s => ({ ...s, [m.id]: result.ok ? 'ok' : 'fail' }))
                            setModelTestMsg(s => ({
                              ...s,
                              [m.id]:
                                result.message +
                                (result.ok
                                  ? ''
                                  : 'detail' in result && result.detail
                                    ? `\n${result.detail}`
                                    : ''),
                            }))
                          }}
                        >
                          {ts === 'testing' ? (
                            <>
                              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
                              测试中…
                            </>
                          ) : ts === 'ok' ? (
                            <>
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
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              联通
                            </>
                          ) : ts === 'fail' ? (
                            <>
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
                              失败
                            </>
                          ) : (
                            <>
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
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              测试连接
                            </>
                          )}
                        </button>
                      </div>
                      {tmsg && (
                        <div
                          className={`mt-2 whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed ${
                            ts === 'ok'
                              ? 'border border-emerald-500/15 bg-emerald-500/10 text-emerald-400'
                              : 'border border-red-500/15 bg-red-500/10 text-red-400'
                          }`}
                        >
                          {tmsg}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {settingsTab === 'balance' && (
              <div className="app-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {/* 余额配置首行：标题 + 操作按钮 */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">余额查询配置</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-primary-500/10 px-2.5 py-1 text-[11px] text-primary-400 transition hover:bg-primary-500/20"
                      onClick={() => {
                        const newConfig = {
                          id: Math.random().toString(36).slice(2) + Date.now().toString(36),
                          name: '新配置',
                          siteType: 'new-api' as const,
                          baseUrl: '',
                          path: '/api/user/self',
                          method: 'GET' as const,
                          headers: { 'Content-Type': 'application/json' },
                          bodyTemplate: '',
                          userId: '',
                          token: '',
                          remark: '',
                        }
                        setCfgDraft(prev => ({
                          ...prev,
                          balanceConfigs: [...(prev.balanceConfigs || []), newConfig],
                          activeBalanceConfigId: newConfig.id,
                        }))
                        setBalanceDropdownOpen(false)
                      }}
                    >
                      + 新增
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-[11px] text-indigo-400 transition hover:bg-indigo-500/20"
                      onClick={() => setTemplatePanelOpen(true)}
                    >
                      配置管理
                    </button>
                  </div>
                </div>

                {/* 当前激活配置的编辑区 */}
                {(() => {
                  const config = cfgDraft.balanceConfigs?.find(
                    c => c.id === cfgDraft.activeBalanceConfigId,
                  )
                  if (!config) {
                    return (
                      <p className="py-4 text-center text-sm text-slate-500">
                        {cfgDraft.balanceConfigs && cfgDraft.balanceConfigs.length > 0
                          ? '请在配置名称旁的下拉菜单中选择一个配置'
                          : '暂无配置，点击「+ 新增」添加'}
                      </p>
                    )
                  }
                  return (
                    <div className="glass-card space-y-2 rounded-lg p-3" key={config.id}>
                      {/* 配置选择下拉 - 点击切换配置 */}
                      <div className="relative" ref={balanceDropdownRef}>
                        <label className="mb-1 block text-[10px] text-slate-500">配置名称</label>
                        <div
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 transition hover:bg-white/[0.08]"
                          onClick={() => setBalanceDropdownOpen(prev => !prev)}
                        >
                          <span className="truncate text-xs">{config.name || '未命名配置'}</span>
                          <svg
                            className={`ml-2 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${balanceDropdownOpen ? 'rotate-180' : ''}`}
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
                        </div>

                        {/* 配置切换下拉面板 */}
                        {balanceDropdownOpen && (
                          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-white/[0.1] bg-[#1a1b2e]/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
                            {/* 配置列表区 */}
                            <div className="py-1.5">
                              <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                                我的配置
                              </div>
                              {cfgDraft.balanceConfigs &&
                                [
                                  ...new Map(cfgDraft.balanceConfigs.map(c => [c.id, c])).values(),
                                ].map(c => {
                                  const isActive = c.id === cfgDraft.activeBalanceConfigId
                                  return (
                                    <div
                                      key={c.id}
                                      className={`group flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs transition ${
                                        isActive
                                          ? 'bg-amber-500/15 text-amber-300'
                                          : 'text-slate-300 hover:bg-white/[0.06]'
                                      }`}
                                      onClick={() => {
                                        setCfgDraft(prev => ({
                                          ...prev,
                                          activeBalanceConfigId: c.id,
                                        }))
                                        setBalanceDropdownOpen(false)
                                      }}
                                    >
                                      <span
                                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${isActive ? 'bg-amber-400' : 'bg-transparent'}`}
                                      />
                                      <span className="flex-1 truncate">
                                        {c.name || '未命名配置'}
                                      </span>
                                      {c.siteType && (
                                        <span className="flex-shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-slate-500">
                                          {getSitePresets().find(p => p.value === c.siteType)
                                            ?.label || c.siteType}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">配置名称</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            placeholder="配置名称"
                            value={config.name || ''}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id ? { ...c, name: e.target.value } : c,
                                  ) || [],
                              }))
                            }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">查询地址</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            placeholder="https://api.example.com"
                            value={config.baseUrl || ''}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id ? { ...c, baseUrl: e.target.value } : c,
                                  ) || [],
                              }))
                            }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">端点路径</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            placeholder="/api/user/self"
                            value={config.path || ''}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id ? { ...c, path: e.target.value } : c,
                                  ) || [],
                              }))
                            }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">请求方法</label>
                          <select
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            value={config.method}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id
                                      ? { ...c, method: e.target.value as 'GET' | 'POST' }
                                      : c,
                                  ) || [],
                              }))
                            }}
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">站点类型</label>
                          <select
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            value={config.siteType || 'new-api'}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id
                                      ? {
                                          ...c,
                                          siteType: e.target.value as BalanceConfig['siteType'],
                                        }
                                      : c,
                                  ) || [],
                              }))
                            }}
                          >
                            {getSitePresets().map(p => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">备注</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            placeholder="服务商名称或说明"
                            value={config.remark || ''}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id ? { ...c, remark: e.target.value } : c,
                                  ) || [],
                              }))
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`cors-${config.id}`}
                          checked={config.useCorsProxy || false}
                          onChange={e => {
                            setCfgDraft(prev => ({
                              ...prev,
                              balanceConfigs:
                                prev.balanceConfigs?.map(c =>
                                  c.id === config.id ? { ...c, useCorsProxy: e.target.checked } : c,
                                ) || [],
                            }))
                          }}
                          className="h-4 w-4 rounded"
                        />
                        <label
                          htmlFor={`cors-${config.id}`}
                          className="cursor-pointer text-[11px] text-slate-400"
                        >
                          使用 CORS 代理（解决跨域问题）
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">用户 ID</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            placeholder="输入用户 ID"
                            value={config.userId || ''}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id ? { ...c, userId: e.target.value } : c,
                                  ) || [],
                              }))
                            }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">访问令牌</label>
                          <input
                            type="password"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            placeholder="输入访问令牌"
                            value={config.token || ''}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id ? { ...c, token: e.target.value } : c,
                                  ) || [],
                              }))
                            }}
                            autoComplete="off"
                          />
                        </div>
                      </div>

                      {config.method === 'POST' && (
                        <div>
                          <label className="mb-1 block text-[10px] text-slate-500">
                            请求体模板
                          </label>
                          <textarea
                            className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            placeholder='{"user_id": "{{userId}}", "token": "{{token}}"}'
                            rows={2}
                            value={config.bodyTemplate || ''}
                            onChange={e => {
                              setCfgDraft(prev => ({
                                ...prev,
                                balanceConfigs:
                                  prev.balanceConfigs?.map(c =>
                                    c.id === config.id ? { ...c, bodyTemplate: e.target.value } : c,
                                  ) || [],
                              }))
                            }}
                          />
                          <p className="mt-1 text-[9px] text-slate-500">
                            支持占位符：{'{'}userId{'}'} {'{'}token{'}'}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-400 transition hover:bg-white/[0.08]"
                          disabled={balanceTestStatus[config.id] === 'testing'}
                          onClick={() => testBalanceConfig(config.id)}
                        >
                          {balanceTestStatus[config.id] === 'testing' ? (
                            <>
                              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
                              测试中…
                            </>
                          ) : (
                            <>
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
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              测试连接
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-400 transition hover:bg-emerald-500/15"
                          onClick={() => {
                            const template: BalanceTemplate = {
                              name: config.name,
                              siteType: config.siteType,
                              baseUrl: config.baseUrl,
                              path: config.path,
                              method: config.method,
                              headers: config.headers,
                              bodyTemplate: config.bodyTemplate,
                              remark: config.remark,
                              useCorsProxy: config.useCorsProxy,
                            }
                            saveBalanceTemplate(template)
                            setSyncToast(true)
                            setTimeout(() => setSyncToast(false), 2000)
                          }}
                          title="将此配置保存为模板"
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
                              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"
                            />
                          </svg>
                          保存模板
                        </button>
                      </div>

                      {balanceTestResultVisible[config.id] && balanceTestMsg[config.id] && (
                        <div
                          className={`mt-2 w-full max-w-full overflow-x-auto whitespace-pre-wrap break-words break-all rounded-lg border px-2.5 py-1.5 text-[10px] leading-relaxed ${
                            balanceTestStatus[config.id] === 'ok'
                              ? 'border-emerald-500/15 bg-emerald-500/10 text-emerald-400'
                              : 'border-red-500/15 bg-red-500/10 text-red-400'
                          }`}
                        >
                          <pre className="font-inherit m-0 whitespace-pre-wrap break-words break-all">
                            {balanceTestMsg[config.id]}
                          </pre>
                        </div>
                      )}
                    </div>
                  )
                })()}

                <p className="rounded-lg bg-white/[0.04] p-3 text-xs leading-relaxed text-slate-500">
                  💡 <strong>使用说明：</strong>
                  <br />
                  1. 点击配置名称旁的下拉按钮切换配置
                  <br />
                  2. 点击「测试连接」验证配置是否正确
                  <br />
                  3. 点击「配置管理」进行配置的增删
                  <br />
                  4. 点击底部「保存」保存所有配置
                </p>
              </div>
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="flex flex-shrink-0 items-center justify-between rounded-b-2xl border-t border-white/[0.06] px-6 py-4">
            <p className="text-[10px] text-slate-400">
              请求头：
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-slate-400">
                Authorization: Bearer API_KEY
              </code>
            </p>
            <div className="flex gap-2">
              <button
                className="glass-button rounded-lg px-4 py-2 text-sm text-slate-300 transition"
                onClick={onClose}
              >
                取消
              </button>
              <button
                className="gradient-button rounded-lg px-5 py-2 text-sm font-medium text-white"
                onClick={handleSave}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 配置管理弹窗 ── */}
      {templatePanelOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setTemplatePanelOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-[400px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#1a1b2e]/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
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
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                配置管理
              </h4>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-200"
                onClick={() => setTemplatePanelOpen(false)}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* 内容区 */}
            <div className="app-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
              {/* 新建配置 */}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300 transition hover:bg-indigo-500/15"
                onClick={() => {
                  const newConfig: BalanceConfig = {
                    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
                    name: '新配置',
                    siteType: 'new-api' as const,
                    baseUrl: '',
                    path: '/api/user/self',
                    method: 'GET' as const,
                    headers: { 'Content-Type': 'application/json' },
                    bodyTemplate: '',
                    userId: '',
                    token: '',
                    remark: '',
                  }
                  setCfgDraft(prev => ({
                    ...prev,
                    balanceConfigs: [...(prev.balanceConfigs || []), newConfig],
                    activeBalanceConfigId: newConfig.id,
                  }))
                }}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                新建配置
              </button>

              {/* 配置列表 */}
              {!cfgDraft.balanceConfigs || cfgDraft.balanceConfigs.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  暂无配置，点击上方按钮新建
                </p>
              ) : (
                <div className="space-y-1.5">
                  {cfgDraft.balanceConfigs.map(config => (
                    <div
                      key={config.id}
                      className="group flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 transition hover:bg-white/[0.06]"
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
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-slate-200">
                          {config.name || '未命名配置'}
                        </div>
                        <div className="truncate text-[9px] text-slate-500">
                          {config.baseUrl || '未设置地址'} ·{' '}
                          {getSitePresets().find(p => p.value === config.siteType)?.label ||
                            config.siteType}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded p-1 text-slate-500 opacity-0 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                        title="删除配置"
                        onClick={() => {
                          const remaining =
                            cfgDraft.balanceConfigs?.filter(c => c.id !== config.id) || []
                          setCfgDraft(prev => ({
                            ...prev,
                            balanceConfigs: remaining,
                            activeBalanceConfigId:
                              prev.activeBalanceConfigId === config.id
                                ? remaining[0]?.id || ''
                                : prev.activeBalanceConfigId,
                          }))
                        }}
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 供应商管理弹窗（叠加在设置弹窗之上） ── */}
      <VendorManager
        open={vendorManagerOpen}
        onClose={() => setVendorManagerOpen(false)}
        cfgDraft={cfgDraft}
        setCfgDraft={setCfgDraft}
      />

      {/* ── 模型选择弹窗（获取模型后弹出） ── */}
      {modelPickerOpen && (
        <div
          className="overlay-dark fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setModelPickerOpen(false)}
        >
          <div
            className="glass-popup popup-enter flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  选择要添加的{modelPickerMode === 'image' ? 'Image' : 'Chat'}模型
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  已获取 {modelPickerList.length} 个模型，勾选后点击确认添加
                </p>
              </div>
              <button
                className="p-1 text-xl leading-none text-slate-500 hover:text-slate-300"
                onClick={() => setModelPickerOpen(false)}
              >
                ×
              </button>
            </div>

            {/* 搜索 + 全选 */}
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/[0.06] px-5 py-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 pl-8 pr-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                  placeholder="搜索模型 id…"
                  value={modelPickerSearch}
                  onChange={e => setModelPickerSearch(e.target.value)}
                />
              </div>
              <button
                className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.06]"
                onClick={() => {
                  const allSelected = filteredPickerModels.every(m => modelPickerSelected.has(m))
                  setModelPickerSelected(prev => {
                    const next = new Set(prev)
                    if (allSelected) {
                      filteredPickerModels.forEach(m => next.delete(m))
                    } else {
                      filteredPickerModels.forEach(m => next.add(m))
                    }
                    return next
                  })
                }}
              >
                {filteredPickerModels.every(m => modelPickerSelected.has(m)) ? '取消全选' : '全选'}
              </button>
            </div>

            {/* 模型列表 */}
            <div className="app-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-3">
              {filteredPickerModels.map(mid => {
                const checked = modelPickerSelected.has(mid)
                return (
                  <label
                    key={mid}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition ${
                      checked
                        ? 'border border-primary-500/20 bg-primary-500/10'
                        : 'border border-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-white/[0.2] bg-transparent text-primary-500 focus:ring-primary-500/30"
                      checked={checked}
                      onChange={() => {
                        setModelPickerSelected(prev => {
                          const next = new Set(prev)
                          if (next.has(mid)) next.delete(mid)
                          else next.add(mid)
                          return next
                        })
                      }}
                    />
                    <span className="truncate font-mono text-xs text-slate-300">{mid}</span>
                  </label>
                )
              })}
              {filteredPickerModels.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-500">无匹配模型</p>
              )}
            </div>

            {/* 底部 */}
            <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] px-5 py-3">
              <span className="text-[11px] text-slate-400">
                已选{' '}
                <span className="font-semibold text-slate-200">{modelPickerSelected.size}</span>{' '}
                个模型
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
                  onClick={() => setModelPickerOpen(false)}
                >
                  取消
                </button>
                <button
                  className="gradient-button rounded-lg px-4 py-1.5 text-xs font-medium text-white"
                  onClick={handleModelPickerConfirm}
                  disabled={modelPickerSelected.size === 0}
                >
                  确认添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SettingsDialog
