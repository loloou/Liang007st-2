// ─────────────────────────────────────────────────────────────────────────────
//  AssetDetail.tsx — Asset detail overlay panel
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import type { IpcAsset } from '../../api/ipcBridge'

interface AssetDetailProps {
  asset: IpcAsset
  onClose: () => void
  onDelete: (id: string) => void
  onToggleFavorite: (asset: IpcAsset) => void
}

const AssetDetail: React.FC<AssetDetailProps> = ({
  asset,
  onClose,
  onDelete,
  onToggleFavorite,
}) => {
  const formatDate = (ts: number) => new Date(ts).toLocaleString()

  return (
    <div className="max-h-[40%] overflow-y-auto border-t border-slate-700/40 bg-slate-800/80 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-300">Details</h4>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-white">
          &times;
        </button>
      </div>

      {/* Preview */}
      {asset.filePath && (
        <div className="mb-2 overflow-hidden rounded-md bg-slate-900">
          <img
            src={`file://${asset.filePath}`}
            alt={asset.prompt || ''}
            className="max-h-40 w-full object-contain"
          />
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-1.5 text-[11px]">
        {asset.prompt && (
          <div>
            <span className="text-slate-500">Prompt:</span>
            <p className="mt-0.5 text-slate-300">{asset.prompt}</p>
          </div>
        )}
        {asset.model && (
          <div className="flex justify-between">
            <span className="text-slate-500">Model:</span>
            <span className="text-slate-300">{asset.model}</span>
          </div>
        )}
        {asset.width && asset.height && (
          <div className="flex justify-between">
            <span className="text-slate-500">Size:</span>
            <span className="text-slate-300">
              {asset.width} x {asset.height}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-500">Created:</span>
          <span className="text-slate-300">{formatDate(asset.createdAt)}</span>
        </div>
        {asset.tags.length > 0 && (
          <div>
            <span className="text-slate-500">Tags:</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {asset.tags.map(t => (
                <span
                  key={t}
                  className="rounded border border-slate-600/30 bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onToggleFavorite(asset)}
          className="flex-1 rounded-md border border-slate-600/40 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700/50"
        >
          {asset.favorite ? 'Unfavorite' : 'Favorite'}
        </button>
        <button
          onClick={() => onDelete(asset.id)}
          className="rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default AssetDetail
