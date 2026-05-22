/**
 * 文本差异计算工具
 * 提供 LCS-based 行级差异对比算法
 */

// ── 类型定义 ─────────────────────────────────────────────────────────────

export type DiffSegment = {
  type: 'unchanged' | 'added' | 'removed' | 'replaced'
  text: string
  changeIndex?: number
}

export type ModificationDetail = {
  changeIndex: number
  type: 'added' | 'removed' | 'replaced' | 'format'
  original: string
  optimized: string
  reason: string
}

// ── LCS 差异算法 ─────────────────────────────────────────────────────────

/** LCS-based line-level diff */
export function computeDiff(
  original: string,
  optimized: string,
): { segments: DiffSegment[]; details: ModificationDetail[] } {
  if (!original && !optimized) return { segments: [], details: [] }
  if (!original) {
    return {
      segments: [{ type: 'added', text: optimized, changeIndex: 0 }],
      details: [{ changeIndex: 0, type: 'added', original: '', optimized, reason: '新增内容' }],
    }
  }
  if (!optimized) {
    return {
      segments: [{ type: 'removed', text: original, changeIndex: 0 }],
      details: [{ changeIndex: 0, type: 'removed', original, optimized: '', reason: '删除内容' }],
    }
  }

  const origLines = original.split('\n')
  const optLines = optimized.split('\n')
  const m = origLines.length
  const n = optLines.length

  // 构建 LCS DP 表
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === optLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯构建对齐结果
  const alignment: Array<{ type: 'match' | 'orig' | 'opt'; origIdx: number; optIdx: number }> = []
  let i = m,
    j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === optLines[j - 1]) {
      alignment.unshift({ type: 'match', origIdx: i - 1, optIdx: j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      alignment.unshift({ type: 'opt', origIdx: -1, optIdx: j - 1 })
      j--
    } else {
      alignment.unshift({ type: 'orig', origIdx: i - 1, optIdx: -1 })
      i--
    }
  }

  const segments: DiffSegment[] = []
  const details: ModificationDetail[] = []
  let changeIndex = 0

  let idx = 0
  while (idx < alignment.length) {
    const item = alignment[idx]

    if (item.type === 'match') {
      segments.push({
        type: 'unchanged',
        text: origLines[item.origIdx] + (idx < alignment.length - 1 ? '\n' : ''),
      })
      idx++
      continue
    }

    const origItems: number[] = []
    while (idx < alignment.length && alignment[idx].type === 'orig') {
      origItems.push(alignment[idx].origIdx)
      idx++
    }

    const optItems: number[] = []
    while (idx < alignment.length && alignment[idx].type === 'opt') {
      optItems.push(alignment[idx].optIdx)
      idx++
    }

    if (origItems.length > 0 && optItems.length > 0) {
      const origText = origItems.map(k => origLines[k]).join('\n')
      const optText = optItems.map(k => optLines[k]).join('\n')
      segments.push({ type: 'replaced', text: origText, changeIndex })
      segments.push({
        type: 'added',
        text: optText + (idx < alignment.length ? '\n' : ''),
        changeIndex,
      })
      details.push({
        changeIndex,
        type: 'replaced',
        original: origText,
        optimized: optText,
        reason: '优化术语表达，提升专业性与准确性',
      })
      changeIndex++
    } else if (origItems.length > 0) {
      const origText = origItems.map(k => origLines[k]).join('\n')
      segments.push({ type: 'removed', text: origText, changeIndex })
      details.push({
        changeIndex,
        type: 'removed',
        original: origText,
        optimized: '',
        reason: '删除冗余或不符合规范的内容',
      })
      changeIndex++
    } else if (optItems.length > 0) {
      const optText = optItems.map(k => optLines[k]).join('\n')
      segments.push({
        type: 'added',
        text: optText + (idx < alignment.length ? '\n' : ''),
        changeIndex,
      })
      details.push({
        changeIndex,
        type: 'added',
        original: '',
        optimized: optText,
        reason: '新增专业维度描述',
      })
      changeIndex++
    }
  }

  return { segments, details }
}
