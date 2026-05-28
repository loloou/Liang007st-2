// ─────────────────────────────────────────────────────────────────────────────
//  CanvasPromptBar.tsx — Prompt input bar with @ image reference picker
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { ImageObjectData } from '../layers/ImageObject'

interface CanvasPromptBarProps {
  onSubmit: (prompt: string, negativePrompt: string, referenceImageIds: string[]) => void
  objects: ImageObjectData[]
  isGenerating: boolean
}

const CanvasPromptBar: React.FC<CanvasPromptBarProps> = ({ onSubmit, objects, isGenerating }) => {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [showNegative, setShowNegative] = useState(false)
  const [referenceIds, setReferenceIds] = useState<string[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Filter canvas images for the @ picker
  const canvasImages = objects.filter(o => o.type === 'image' && o.imageUrl && o.status === 'idle')

  const filteredImages = pickerFilter
    ? canvasImages.filter(
        o =>
          (o.prompt || '').toLowerCase().includes(pickerFilter.toLowerCase()) ||
          o.id.includes(pickerFilter),
      )
    : canvasImages

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (prompt.trim() && !isGenerating) {
          onSubmit(prompt.trim(), negativePrompt.trim(), referenceIds)
        }
      }
    },
    [prompt, negativePrompt, referenceIds, isGenerating, onSubmit],
  )

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setPrompt(value)

    // Detect @ trigger
    const cursorPos = e.target.selectionStart || 0
    const textBefore = value.slice(0, cursorPos)
    const atMatch = textBefore.match(/@(\w*)$/)
    if (atMatch) {
      setShowPicker(true)
      setPickerFilter(atMatch[1] || '')
    } else {
      setShowPicker(false)
    }
  }, [])

  const selectReference = useCallback(
    (id: string) => {
      if (referenceIds.includes(id)) {
        setReferenceIds(referenceIds.filter(r => r !== id))
      } else {
        setReferenceIds([...referenceIds, id])
      }
      setShowPicker(false)
      inputRef.current?.focus()
    },
    [referenceIds],
  )

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="absolute bottom-4 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2">
      {/* Reference image badges */}
      {referenceIds.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-2">
          {referenceIds.map(id => {
            const obj = objects.find(o => o.id === id)
            return (
              <div
                key={id}
                className="flex items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300"
              >
                <span className="max-w-[100px] truncate">
                  {obj?.prompt?.slice(0, 20) || `Image ${id.slice(0, 6)}`}
                </span>
                <button
                  onClick={() => setReferenceIds(referenceIds.filter(r => r !== id))}
                  className="ml-1 text-indigo-400 hover:text-white"
                >
                  x
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border border-slate-700/60 bg-slate-800/95 p-3 shadow-2xl backdrop-blur-sm">
        {/* Main prompt input */}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to generate... (type @ to reference canvas images)"
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-600/40 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
            />

            {/* @ Image picker popup */}
            {showPicker && filteredImages.length > 0 && (
              <div
                ref={pickerRef}
                className="absolute bottom-full left-0 z-50 mb-2 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-600/60 bg-slate-800 shadow-xl"
              >
                <div className="border-b border-slate-700 p-2 text-xs text-slate-400">
                  Select reference image
                </div>
                {filteredImages.map(img => (
                  <button
                    key={img.id}
                    onClick={() => selectReference(img.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-700/50 ${referenceIds.includes(img.id) ? 'bg-indigo-500/10 text-indigo-300' : 'text-slate-300'}`}
                  >
                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-slate-700">
                      {img.imageUrl && (
                        <img src={img.imageUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">
                        {img.prompt?.slice(0, 40) || `Image ${img.id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        {img.width}x{img.height}
                      </div>
                    </div>
                    {referenceIds.includes(img.id) && (
                      <span className="text-xs text-indigo-400">Selected</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <button
              onClick={() => setShowNegative(!showNegative)}
              className="rounded-md border border-slate-600/40 px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200"
              title="Toggle negative prompt"
            >
              NEG
            </button>
            <button
              onClick={() =>
                prompt.trim() &&
                !isGenerating &&
                onSubmit(prompt.trim(), negativePrompt.trim(), referenceIds)
              }
              disabled={!prompt.trim() || isGenerating}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {isGenerating ? '...' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Negative prompt */}
        {showNegative && (
          <div className="mt-2">
            <input
              type="text"
              value={negativePrompt}
              onChange={e => setNegativePrompt(e.target.value)}
              placeholder="Negative prompt..."
              className="w-full rounded-lg border border-slate-600/40 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default CanvasPromptBar
