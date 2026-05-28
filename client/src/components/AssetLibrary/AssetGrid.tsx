// ─────────────────────────────────────────────────────────────────────────────
//  AssetGrid.tsx — Grid view of asset thumbnails
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import type { IpcAsset } from '../../api/ipcBridge'

interface AssetGridProps {
  assets: IpcAsset[]
  onSelect: (asset: IpcAsset) => void
  onDelete: (id: string) => void
  onToggleFavorite: (asset: IpcAsset) => void
}

const AssetGrid: React.FC<AssetGridProps> = ({ assets, onSelect, onDelete, onToggleFavorite }) => {
  const handleDragStart = (asset: IpcAsset, e: React.DragEvent) => {
    e.dataTransfer.setData('application/asset-id', asset.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {assets.map(asset => (
        <div
          key={asset.id}
          className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-slate-700/30 bg-slate-800 transition-colors hover:border-indigo-500/40"
          onClick={() => onSelect(asset)}
          draggable
          onDragStart={e => handleDragStart(asset, e)}
        >
          {/* Thumbnail */}
          {asset.thumbnailPath ? (
            <img
              src={`file://${asset.thumbnailPath}`}
              alt={asset.prompt || ''}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-600">
              No preview
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-end bg-black/40 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white">
                {asset.prompt?.slice(0, 30) || 'Untitled'}
              </p>
              <p className="text-[10px] text-slate-300">{asset.model || ''}</p>
            </div>
          </div>

          {/* Favorite badge */}
          {asset.favorite && (
            <div className="absolute right-1 top-1 text-xs text-yellow-400">&#9733;</div>
          )}

          {/* Action buttons on hover */}
          <div className="absolute left-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={e => {
                e.stopPropagation()
                onToggleFavorite(asset)
              }}
              className="flex h-5 w-5 items-center justify-center rounded bg-black/50 text-[10px] text-white hover:bg-black/70"
              title={asset.favorite ? 'Unfavorite' : 'Favorite'}
            >
              {asset.favorite ? '&#9733;' : '&#9734;'}
            </button>
            <button
              onClick={e => {
                e.stopPropagation()
                onDelete(asset.id)
              }}
              className="flex h-5 w-5 items-center justify-center rounded bg-black/50 text-[10px] text-red-400 hover:bg-black/70"
              title="Delete"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default AssetGrid
