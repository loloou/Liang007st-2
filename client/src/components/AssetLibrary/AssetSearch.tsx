// ─────────────────────────────────────────────────────────────────────────────
//  AssetSearch.tsx — Search bar with tag filter chips
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'

interface AssetSearchProps {
  value: string
  onChange: (v: string) => void
  tags: string[]
  selectedTags: string[]
  onTagClick: (tag: string) => void
}

const AssetSearch: React.FC<AssetSearchProps> = ({
  value,
  onChange,
  tags,
  selectedTags,
  onTagClick,
}) => {
  return (
    <div className="border-b border-slate-700/30 px-3 py-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search assets..."
        className="w-full rounded-md border border-slate-600/40 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none"
      />
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.slice(0, 10).map(tag => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                selectedTags.includes(tag)
                  ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-300'
                  : 'border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/50'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default AssetSearch
