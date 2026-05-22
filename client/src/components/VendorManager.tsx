/**
 * VendorManager — API 供应商管理弹窗
 *
 * 从 App.tsx 提取的独立组件。
 * 内部管理编辑状态，通过 cfgDraft/setCfgDraft 与父组件共享配置草稿。
 */
import React, { useState } from 'react'
import type { ApiConfig } from '../api/settings'
import {
  saveApiConfig,
  addApiVendor,
  setDefaultApiVendor,
  switchApiVendor,
  updateApiVendor,
  removeApiVendor,
} from '../api/settings'

interface Props {
  open: boolean
  onClose: () => void
  cfgDraft: ApiConfig
  setCfgDraft: React.Dispatch<React.SetStateAction<ApiConfig>>
}

const VendorManager: React.FC<Props> = ({ open, onClose, cfgDraft, setCfgDraft }) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [remarkInput, setRemarkInput] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addApiKey, setAddApiKey] = useState('')
  const [addRemark, setAddRemark] = useState('')

  if (!open) return null

  const handleClose = () => {
    onClose()
    setEditingId(null)
  }

  return (
    <div
      className="overlay-dark fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="glass-popup popup-enter flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: 580, maxWidth: '96vw', maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <svg
                className="h-4 w-4 text-primary-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              API 供应商管理
              {cfgDraft.apiVendors?.length > 0 && (
                <span className="rounded-full bg-primary-500/10 px-1.5 py-0.5 text-[11px] font-medium text-primary-400">
                  {cfgDraft.apiVendors.length} 个
                </span>
              )}
            </h3>
            <p className="mt-0.5 text-[10px] text-slate-500">
              在上方填写信息后点击「保存」即可添加；点击 ✏️ 可编辑各项信息
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
            aria-label="关闭"
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

        {/* 新增供应商 */}
        <div className="flex-shrink-0 px-4 pt-3">
          {!showAddForm ? (
            <button
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500/20 px-3 py-2 text-xs text-emerald-400 transition hover:bg-emerald-500/10"
              onClick={() => setShowAddForm(true)}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              新增供应商
            </button>
          ) : (
            <div className="mb-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                    供应商名称 *
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="如：我的API"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                    Base URL *
                  </label>
                  <input
                    type="url"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 font-mono text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    value={addUrl}
                    onChange={e => setAddUrl(e.target.value)}
                    placeholder="https://api.example.com"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                    API Key（可选）
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 font-mono text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    value={addApiKey}
                    onChange={e => setAddApiKey(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                    备注（可选）
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    value={addRemark}
                    onChange={e => setAddRemark(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!addName.trim() || !addUrl.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    if (!addName.trim() || !addUrl.trim()) return
                    const updated = addApiVendor({
                      name: addName.trim(),
                      baseUrl: addUrl.trim(),
                      apiKey: addApiKey.trim() || undefined,
                      remark: addRemark.trim() || undefined,
                    })
                    setCfgDraft(d => ({ ...d, apiVendors: updated.apiVendors }))
                    setAddName('')
                    setAddUrl('')
                    setAddApiKey('')
                    setAddRemark('')
                    setShowAddForm(false)
                  }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  保存
                </button>
                <button
                  className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-500 transition hover:bg-white/[0.08]"
                  onClick={() => {
                    setShowAddForm(false)
                    setAddName('')
                    setAddUrl('')
                    setAddApiKey('')
                    setAddRemark('')
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 供应商列表 */}
        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {cfgDraft.apiVendors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] py-12 text-center text-xs text-slate-500">
              <svg
                className="mx-auto mb-3 h-10 w-10 opacity-20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <p className="font-medium text-slate-400">暂无供应商</p>
              <p className="mt-1 text-slate-400">
                在「模型接口配置」填写 Base URL、API Key 和供应商名称后点击「保存」即可添加
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cfgDraft.apiVendors.map(vendor => {
                const isActive = cfgDraft.activeVendorId === vendor.id
                const isDefault = vendor.isDefault
                const isEditing = editingId === vendor.id
                return (
                  <div
                    key={vendor.id}
                    className={`rounded-xl border transition-all ${
                      isEditing
                        ? 'border-amber-500/30 bg-amber-500/[0.06] shadow-sm'
                        : isActive
                          ? 'border-primary-500/20 bg-primary-500/[0.06] shadow-sm'
                          : 'border-white/[0.08] bg-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    {/* 展示行 */}
                    <div className="flex items-start gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p
                            className={`truncate text-sm font-semibold ${isActive ? 'text-primary-400' : 'text-slate-300'}`}
                          >
                            {vendor.name}
                          </p>
                          {isActive && (
                            <span className="flex-shrink-0 rounded-full bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-medium text-primary-400">
                              当前使用
                            </span>
                          )}
                          {isDefault && (
                            <span className="flex-shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                              ⭐ 默认
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                          {vendor.baseUrl}
                        </p>
                        {vendor.apiKey && (
                          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                            Key:{' '}
                            {vendor.apiKey.length > 8
                              ? vendor.apiKey.slice(0, 4) + '••••' + vendor.apiKey.slice(-4)
                              : '••••••••'}
                          </p>
                        )}
                        {vendor.remark && (
                          <p className="mt-0.5 text-[10px] italic text-slate-500">
                            备注：{vendor.remark}
                          </p>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-shrink-0 items-center gap-1">
                        <button
                          title={isDefault ? '已是默认供应商' : '设为默认（启动时自动应用）'}
                          className={`rounded-lg border p-1.5 transition ${isDefault ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' : 'border-white/[0.08] text-slate-400 hover:border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-500'}`}
                          onClick={() => {
                            const updated = setDefaultApiVendor(isDefault ? '' : vendor.id)
                            setCfgDraft(d => ({ ...d, apiVendors: updated.apiVendors }))
                          }}
                        >
                          <svg
                            className="h-3 w-3"
                            fill={isDefault ? 'currentColor' : 'none'}
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                            />
                          </svg>
                        </button>
                        <button
                          title="切换为当前使用的供应商"
                          className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${isActive ? 'border-primary-500/20 bg-primary-500/10 text-primary-400' : 'border-white/[0.08] bg-white/[0.06] text-slate-400 hover:border-primary-500/20 hover:bg-primary-500/10 hover:text-primary-400'}`}
                          onClick={() => {
                            const updated = switchApiVendor(vendor.id)
                            setCfgDraft(d => ({
                              ...d,
                              globalBaseUrl: vendor.baseUrl,
                              globalApiKey: vendor.apiKey?.trim()
                                ? vendor.apiKey.trim()
                                : d.globalApiKey,
                              activeVendorId: vendor.id,
                              apiVendors: updated.apiVendors,
                            }))
                          }}
                        >
                          {isActive ? '✓ 使用中' : '使用'}
                        </button>
                        <button
                          title="编辑此供应商"
                          className={`rounded-lg border p-1.5 transition ${isEditing ? 'border-amber-500/30 bg-amber-500/15 text-amber-400' : 'border-white/[0.08] text-slate-400 hover:border-amber-200 hover:bg-amber-500/10 hover:text-amber-500'}`}
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null)
                            } else {
                              setEditingId(vendor.id)
                              setNameInput(vendor.name)
                              setUrlInput(vendor.baseUrl)
                              setApiKeyInput(vendor.apiKey || '')
                              setRemarkInput(vendor.remark || '')
                            }
                          }}
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        {deleteConfirm === vendor.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              className="rounded-lg bg-red-500 px-2 py-1 text-xs text-white transition hover:bg-red-600"
                              onClick={() => {
                                const updated = removeApiVendor(vendor.id)
                                setCfgDraft(d => ({
                                  ...d,
                                  apiVendors: updated.apiVendors,
                                  activeVendorId: updated.activeVendorId,
                                  globalBaseUrl: updated.globalBaseUrl,
                                }))
                                setDeleteConfirm(null)
                                if (editingId === vendor.id) setEditingId(null)
                              }}
                            >
                              是
                            </button>
                            <button
                              className="rounded-lg border border-white/[0.08] px-2 py-1 text-xs text-slate-500 transition hover:bg-white/[0.04]"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              否
                            </button>
                          </div>
                        ) : (
                          <button
                            title="删除此供应商"
                            className="rounded-lg border border-white/[0.08] p-1.5 text-slate-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500"
                            onClick={() => setDeleteConfirm(vendor.id)}
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
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* 内联编辑展开区 */}
                    {isEditing && (
                      <div className="border-t border-amber-100 px-3.5 pb-3">
                        <div className="mb-2 mt-2.5 grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                              供应商名称
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                              value={nameInput}
                              onChange={e => setNameInput(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                              Base URL
                            </label>
                            <input
                              type="url"
                              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 font-mono text-xs focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                              value={urlInput}
                              onChange={e => setUrlInput(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                              API Key（可选）
                            </label>
                            <input
                              type="password"
                              autoComplete="off"
                              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 font-mono text-xs focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                              value={apiKeyInput}
                              onChange={e => setApiKeyInput(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-500">
                              备注（可选）
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                              value={remarkInput}
                              onChange={e => setRemarkInput(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled={!nameInput.trim() || !urlInput.trim()}
                            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => {
                              if (!nameInput.trim() || !urlInput.trim()) return
                              const updated = updateApiVendor(vendor.id, {
                                name: nameInput.trim(),
                                baseUrl: urlInput.trim(),
                                apiKey: apiKeyInput.trim() || undefined,
                                remark: remarkInput.trim() || undefined,
                              })
                              setCfgDraft(d => ({
                                ...d,
                                apiVendors: updated.apiVendors,
                                globalBaseUrl: updated.globalBaseUrl,
                              }))
                              setEditingId(null)
                            }}
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
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            保存修改
                          </button>
                          <button
                            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-500 transition hover:bg-white/[0.08]"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.03] px-5 py-3">
          <p className="text-[10px] text-slate-400">⭐ 设为默认 = 下次打开时自动应用该供应商</p>
          <button
            className="rounded-xl bg-primary-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-600"
            onClick={() => {
              saveApiConfig(cfgDraft)
              handleClose()
            }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

export default VendorManager
