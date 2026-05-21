import { describe, it, expect } from 'vitest'
import { getTheme, setTheme, THEMES } from '../../utils/theme'

describe('theme utils', () => {
  it('getTheme returns a valid theme id', () => {
    const theme = getTheme()
    expect(THEMES.map(t => t.id)).toContain(theme)
  })

  it('setTheme updates the current theme', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
  })

  it('THEMES contains 7 themes', () => {
    expect(THEMES).toHaveLength(7)
  })
})
