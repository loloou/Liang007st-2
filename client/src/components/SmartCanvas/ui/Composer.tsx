import React, { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent } from 'react'
import type { RatioPreset, ResolutionPreset } from '../types'
import { SIZE_PRESETS } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
//  Composer — floating prompt input card for SmartCanvas generation
// ─────────────────────────────────────────────────────────────────────────────

export interface ComposerProps {
  position: { x: number; y: number } | null
  engine: 'api' | 'modelscope'
  onEngineChange: (e: 'api' | 'modelscope') => void
  isRunning: boolean
  onRun: (prompt: string, negativePrompt: string, refImageIds: string[]) => void
  onCascadeRun: (prompt: string) => void
  mentionableImages: Array<{ id: string; url: string; label: string }>
}

// ── Ratio options ────────────────────────────────────────────────────────────

const RATIO_OPTIONS: Array<{ value: RatioPreset; label: string; icon: string }> = [
  { value: 'square', label: 'Square', icon: '◻' },
  { value: 'landscape', label: 'Landscape', icon: '▬' },
  { value: 'portrait', label: 'Portrait', icon: '▮' },
  { value: 'wide', label: 'Wide (16:9)', icon: '▭' },
  { value: 'story', label: 'Story (9:16)', icon: '▯' },
]

const RESOLUTION_OPTIONS: ResolutionPreset[] = ['1k', '2k', '4k']

// ── Mention dropdown item ────────────────────────────────────────────────────

interface MentionItemProps {
  image: { id: string; url: string; label: string }
  isHighlighted: boolean
  onSelect: (image: { id: string; url: string; label: string }) => void
}

const MentionItem: React.FC<MentionItemProps> = React.memo(({ image, isHighlighted, onSelect }) => (
  <button
    type="button"
    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
      isHighlighted ? 'bg-indigo-600/40 text-white' : 'text-slate-300 hover:bg-slate-700/60'
    }`}
    onMouseDown={e => {
      e.preventDefault()
      onSelect(image)
    }}
  >
    <img src={image.url} alt={image.label} className="h-6 w-6 shrink-0 rounded object-cover" />
    <span className="truncate">{image.label}</span>
  </button>
))
MentionItem.displayName = 'MentionItem'

// ── Composer component ───────────────────────────────────────────────────────

export const Composer: React.FC<ComposerProps> = React.memo(
  ({ position, engine, onEngineChange, isRunning, onRun, onCascadeRun, mentionableImages }) => {
    // ── Internal state ───────────────────────────────────────────────────
    const [prompt, setPrompt] = useState('')
    const [negativePrompt, setNegativePrompt] = useState('')
    const [ratio, setRatio] = useState<RatioPreset>('square')
    const [resolution, setResolution] = useState<ResolutionPreset>('1k')
    const [count, setCount] = useState(1)
    const [showNegative, setShowNegative] = useState(false)
    const [showRatioDropdown, setShowRatioDropdown] = useState(false)

    // @mention state
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = useState(0)
    const [selectedRefs, setSelectedRefs] = useState<string[]>([])

    const promptRef = useRef<HTMLDivElement>(null)
    const mentionDropdownRef = useRef<HTMLDivElement>(null)
    const ratioDropdownRef = useRef<HTMLDivElement>(null)

    // ── Filtered mention list ────────────────────────────────────────────
    const filteredMentions = useMemo(() => {
      if (mentionQuery === null) return []
      const q = mentionQuery.toLowerCase()
      return mentionableImages.filter(
        img => img.label.toLowerCase().includes(q) || img.id.toLowerCase().includes(q),
      )
    }, [mentionQuery, mentionableImages])

    // ── Resolve size from ratio + resolution ─────────────────────────────
    const resolvedSize = useMemo(() => {
      const preset = SIZE_PRESETS[ratio]?.[resolution]
      return preset ?? { w: 1024, h: 1024 }
    }, [ratio, resolution])

    // ── Close dropdowns on outside click ─────────────────────────────────
    useEffect(() => {
      function handleClick(e: MouseEvent) {
        if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(e.target as Node)) {
          setShowRatioDropdown(false)
        }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    // ── Reset mention state when position changes ────────────────────────
    useEffect(() => {
      setMentionQuery(null)
      setMentionIndex(0)
    }, [position])

    // ── Prompt input handler ─────────────────────────────────────────────
    const handlePromptInput = useCallback(() => {
      const el = promptRef.current
      if (!el) return

      const text = el.innerText ?? ''
      setPrompt(text)

      // Detect @mention trigger
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) {
        setMentionQuery(null)
        return
      }

      // Compute absolute text offset by creating a range from start of element to cursor
      const range = sel.getRangeAt(0)
      const preRange = document.createRange()
      preRange.setStart(el, 0)
      preRange.setEnd(range.startContainer, range.startOffset)
      const textBefore = preRange.toString()

      const atMatch = textBefore.match(/@(\w*)$/)

      if (atMatch) {
        setMentionQuery(atMatch[1])
        setMentionIndex(0)
      } else {
        setMentionQuery(null)
      }
    }, [])

    // ── Insert mention ───────────────────────────────────────────────────
    const insertMention = useCallback((image: { id: string; label: string }) => {
      const el = promptRef.current
      if (!el) return

      // Replace the @query with the mention tag
      const text = el.innerText ?? ''
      const atIdx = text.lastIndexOf('@')
      if (atIdx === -1) return

      const before = text.slice(0, atIdx)
      const after = text.slice(atIdx).replace(/@\w*/, '')
      const newText = `${before}@${image.label}${after} `

      el.innerText = newText
      setPrompt(newText)
      setMentionQuery(null)
      setMentionIndex(0)

      // Add to selected refs
      setSelectedRefs(prev => (prev.includes(image.id) ? prev : [...prev, image.id]))

      // Restore cursor to end
      requestAnimationFrame(() => {
        const range = document.createRange()
        const sel = window.getSelection()
        range.selectNodeContents(el)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
        el.focus()
      })
    }, [])

    // ── Run handler ──────────────────────────────────────────────────────
    const handleRun = useCallback(() => {
      const trimmed = prompt.trim()
      if (!trimmed || isRunning) return
      onRun(trimmed, negativePrompt.trim(), selectedRefs)
    }, [prompt, negativePrompt, selectedRefs, isRunning, onRun])

    // ── Keyboard handling for mention navigation ─────────────────────────
    const handlePromptKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        // Mention navigation
        if (mentionQuery !== null && filteredMentions.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setMentionIndex(i => (i + 1) % filteredMentions.length)
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setMentionIndex(i => (i <= 0 ? filteredMentions.length - 1 : i - 1))
            return
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            const target = filteredMentions[mentionIndex]
            if (target) insertMention(target)
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setMentionQuery(null)
            return
          }
        }

        // Submit on Ctrl/Cmd + Enter
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          handleRun()
        }
      },
      [mentionQuery, filteredMentions, mentionIndex, insertMention, handleRun],
    )

    const handleCascadeRun = useCallback(() => {
      const trimmed = prompt.trim()
      if (!trimmed || isRunning) return
      onCascadeRun(trimmed)
    }, [prompt, isRunning, onCascadeRun])

    // ── Count adjustment ─────────────────────────────────────────────────
    const adjustCount = useCallback((delta: number) => {
      setCount(c => Math.max(1, Math.min(8, c + delta)))
    }, [])

    // ── Remove ref image ─────────────────────────────────────────────────
    const removeRef = useCallback((id: string) => {
      setSelectedRefs(prev => prev.filter(r => r !== id))
    }, [])

    // ── Hidden when no position ──────────────────────────────────────────
    if (!position) return null

    // ── Render ───────────────────────────────────────────────────────────
    return (
      <div
        className="absolute z-50 w-[420px] rounded-xl border border-slate-700 bg-slate-800/95 shadow-2xl backdrop-blur-lg"
        style={{ left: position.x, top: position.y }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── Header: Engine toggle ─────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-slate-700/60 px-3 py-2">
          <span className="mr-2 text-xs font-medium text-slate-400">Engine</span>
          <div className="flex rounded-md bg-slate-900/60 p-0.5">
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs font-medium transition-all ${
                engine === 'api'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => onEngineChange('api')}
            >
              API
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs font-medium transition-all ${
                engine === 'modelscope'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => onEngineChange('modelscope')}
            >
              ModelScope
            </button>
          </div>
        </div>

        {/* ── Prompt input ──────────────────────────────────────────────── */}
        <div className="relative px-3 pb-1 pt-3">
          <div
            ref={promptRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Prompt input"
            aria-placeholder="Describe what to generate... type @ for image reference"
            className="min-h-[72px] w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
            onInput={handlePromptInput}
            onKeyDown={handlePromptKeyDown}
            data-placeholder="Describe what to generate... type @ for image reference"
          />

          {/* Empty state placeholder */}
          {!prompt && (
            <div className="pointer-events-none absolute left-6 top-5 text-sm text-slate-500">
              Describe what to generate... type{' '}
              <span className="rounded bg-slate-700/60 px-1 font-mono text-indigo-400">@</span> for
              image reference
            </div>
          )}

          {/* ── @mention dropdown ────────────────────────────────────────── */}
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div
              ref={mentionDropdownRef}
              className="absolute left-3 right-3 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-600/50 bg-slate-800 py-1 shadow-xl"
            >
              {filteredMentions.map((img, idx) => (
                <MentionItem
                  key={img.id}
                  image={img}
                  isHighlighted={idx === mentionIndex}
                  onSelect={insertMention}
                />
              ))}
            </div>
          )}

          {/* Empty mention state */}
          {mentionQuery !== null && filteredMentions.length === 0 && (
            <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-lg border border-slate-600/50 bg-slate-800 px-3 py-2 text-xs text-slate-500 shadow-xl">
              No images available to reference
            </div>
          )}
        </div>

        {/* ── Selected reference images ──────────────────────────────────── */}
        {selectedRefs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Refs
            </span>
            {selectedRefs.map(refId => {
              const img = mentionableImages.find(m => m.id === refId)
              if (!img) return null
              return (
                <span
                  key={refId}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-300"
                >
                  <img src={img.url} alt={img.label} className="h-4 w-4 rounded-sm object-cover" />
                  {img.label}
                  <button
                    type="button"
                    className="ml-0.5 text-indigo-400 hover:text-indigo-200"
                    onClick={() => removeRef(refId)}
                    aria-label={`Remove reference ${img.label}`}
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* ── Negative prompt toggle ────────────────────────────────────── */}
        <div className="px-3">
          <button
            type="button"
            className="mb-1 text-[11px] text-slate-500 hover:text-slate-300"
            onClick={() => setShowNegative(v => !v)}
          >
            {showNegative ? '▾ Negative prompt' : '▸ Negative prompt'}
          </button>
          {showNegative && (
            <textarea
              value={negativePrompt}
              onChange={e => setNegativePrompt(e.target.value)}
              placeholder="Things to avoid..."
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-xs text-slate-300 outline-none placeholder:text-slate-600 focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
            />
          )}
        </div>

        {/* ── Parameter pills ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-700/40 px-3 py-2">
          {/* Ratio pill */}
          <div className="relative" ref={ratioDropdownRef}>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-slate-600/50 bg-slate-700/40 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700/70"
              onClick={() => setShowRatioDropdown(v => !v)}
            >
              <span className="text-[10px]">
                {RATIO_OPTIONS.find(r => r.value === ratio)?.icon ?? '◻'}
              </span>
              <span className="capitalize">
                {RATIO_OPTIONS.find(r => r.value === ratio)?.label ?? ratio}
              </span>
              <svg
                className="h-3 w-3 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showRatioDropdown && (
              <div className="absolute bottom-full left-0 z-50 mb-1 w-44 rounded-lg border border-slate-600/50 bg-slate-800 py-1 shadow-xl">
                {RATIO_OPTIONS.map(opt => {
                  const size = SIZE_PRESETS[opt.value]?.[resolution]
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        ratio === opt.value
                          ? 'bg-indigo-600/30 text-indigo-300'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                      onClick={() => {
                        setRatio(opt.value)
                        setShowRatioDropdown(false)
                      }}
                    >
                      <span className="w-4 text-center text-[11px]">{opt.icon}</span>
                      <span className="flex-1">{opt.label}</span>
                      {size && (
                        <span className="text-[10px] text-slate-500">
                          {size.w}×{size.h}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Resolution toggle */}
          <div className="flex rounded-md bg-slate-900/50 p-0.5">
            {RESOLUTION_OPTIONS.map(res => (
              <button
                key={res}
                type="button"
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                  resolution === res
                    ? 'bg-slate-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                onClick={() => setResolution(res)}
              >
                {res.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Count input */}
          <div className="flex items-center rounded-md border border-slate-600/50 bg-slate-700/40">
            <button
              type="button"
              className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-white disabled:opacity-30"
              onClick={() => adjustCount(-1)}
              disabled={count <= 1}
              aria-label="Decrease count"
            >
              −
            </button>
            <span className="min-w-[20px] text-center text-xs font-medium text-slate-200">
              {count}
            </span>
            <button
              type="button"
              className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-white disabled:opacity-30"
              onClick={() => adjustCount(1)}
              disabled={count >= 8}
              aria-label="Increase count"
            >
              +
            </button>
          </div>

          {/* Size indicator */}
          <span className="ml-auto text-[10px] text-slate-500">
            {resolvedSize.w}×{resolvedSize.h}
          </span>
        </div>

        {/* ── Action buttons ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-t border-slate-700/40 px-3 py-2.5">
          <button
            type="button"
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleRun}
            disabled={isRunning || !prompt.trim()}
          >
            {isRunning ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
                Running…
              </span>
            ) : (
              'Run'
            )}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-600/60 bg-slate-700/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-slate-700 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleCascadeRun}
            disabled={isRunning || !prompt.trim()}
            title="Chain Run — run prompt across connected nodes"
          >
            Chain Run
          </button>
        </div>

        {/* ── Keyboard hint ─────────────────────────────────────────────── */}
        <div className="border-t border-slate-700/30 px-3 py-1.5 text-[10px] text-slate-600">
          <kbd className="rounded bg-slate-700/50 px-1 font-mono">Ctrl+Enter</kbd> to run
        </div>
      </div>
    )
  },
)

Composer.displayName = 'Composer'
