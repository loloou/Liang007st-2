// ─────────────────────────────────────────────────────────────────────────────
//  AssetLibrary.tsx — Asset library panel with grid view, search, tags
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react'
import { getElectronAPI, type IpcAsset } from '../../api/ipcBridge'
import AssetGrid from './AssetGrid'
import AssetSearch from './AssetSearch'
import AssetDetail from './AssetDetail'

interface AssetLibraryProps {
  onClose?: () => void
  onDragStart?: (assetId: string, e: React.DragEvent) => void
}

const AssetLibrary: React.FC<AssetLibraryProps> = ({ onClose }) => {
  const [assets, setAssets] = useState<IpcAsset[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedAsset, setSelectedAsset] = useState<IpcAsset | null>(null)
  const [loading, setLoading] = useState(false)

  const loadAssets = useCallback(async () => {
    const api = getElectronAPI()
    if (!api) return

    setLoading(true)
    try {
      const result = await api.assetsList({
        search: search || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        limit: 100,
      })
      setAssets(result.assets)
      setTotal(result.total)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [search, selectedTags])

  const loadTags = useCallback(async () => {
    const api = getElectronAPI()
    if (!api) return
    try {
      const tags = await api.assetsTags()
      setAllTags(tags)
    } catch {
      // Non-critical in web-only mode or before Electron services are ready.
    }
  }, [])

  useEffect(() => {
    loadAssets()
    loadTags()
  }, [loadAssets, loadTags])

  const handleDelete = useCallback(
    async (id: string) => {
      const api = getElectronAPI()
      if (!api) return
      await api.assetsDelete(id)
      setSelectedAsset(null)
      loadAssets()
    },
    [loadAssets],
  )

  const handleToggleFavorite = useCallback(
    async (asset: IpcAsset) => {
      const api = getElectronAPI()
      if (!api) return
      await api.assetsUpdate(asset.id, { favorite: !asset.favorite })
      loadAssets()
    },
    [loadAssets],
  )

  const handleTagFilter = useCallback((tag: string) => {
    setSelectedTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]))
  }, [])

  return (
    <div className="flex h-full flex-col border-l border-slate-700/40 bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-200">Asset Library</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{total} images</span>
          {onClose && (
            <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <AssetSearch
        value={search}
        onChange={setSearch}
        tags={allTags}
        selectedTags={selectedTags}
        onTagClick={handleTagFilter}
      />

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-500">
            Loading...
          </div>
        ) : assets.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-500">
            {search || selectedTags.length > 0
              ? 'No matching assets'
              : 'No assets yet. Generate some images!'}
          </div>
        ) : (
          <AssetGrid
            assets={assets}
            onSelect={setSelectedAsset}
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </div>

      {/* Detail panel */}
      {selectedAsset && (
        <AssetDetail
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onDelete={handleDelete}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </div>
  )
}

export default AssetLibrary
