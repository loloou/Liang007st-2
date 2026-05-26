// ─────────────────────────────────────────────────────────────────────────────
//  favorites.ts — 图片收藏持久化（localStorage）
//  支持标签分组、筛选
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'liang007_favorites'
const TAGS_KEY = 'liang007_fav_tags'
const MAX_FAVORITES = 500

export type FavoriteImage = {
  /** 图片唯一标识 */
  id: string
  /** 图片 URL */
  url: string
  /** 原图 URL */
  originalUrl?: string
  /** 收藏时间 */
  favoritedAt: number
  /** 来源 prompt */
  prompt?: string
  /** 模型 */
  model?: string
  /** 宽 */
  width?: number
  /** 高 */
  height?: number
  /** 标签列表 */
  tags?: string[]
  /** 分组名称 */
  group?: string
}

// ── 加载/保存 ─────────────────────────────────────────────────────────────

function loadFavorites(): FavoriteImage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as FavoriteImage[]
  } catch {
    return []
  }
}

function saveFavorites(favorites: FavoriteImage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.slice(0, MAX_FAVORITES)))
  } catch (e) {
    console.warn('[favorites] 收藏保存失败：', e)
  }
}

// ── 标签管理 ──────────────────────────────────────────────────────────────

/** 获取所有用户自定义标签 */
export function getAllTags(): string[] {
  try {
    const raw = localStorage.getItem(TAGS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

/** 保存标签列表 */
function saveTags(tags: string[]): void {
  try {
    localStorage.setItem(TAGS_KEY, JSON.stringify([...new Set(tags)]))
  } catch {
    /* ignore */
  }
}

/** 添加一个标签（全局标签库） */
export function addTag(tag: string): void {
  const tags = getAllTags()
  if (!tags.includes(tag)) {
    tags.push(tag)
    saveTags(tags)
  }
}

/** 删除一个标签（全局 + 从所有收藏中移除） */
export function deleteTag(tag: string): void {
  saveTags(getAllTags().filter(t => t !== tag))
  const favs = loadFavorites().map(f => ({
    ...f,
    tags: f.tags?.filter(t => t !== tag),
  }))
  saveFavorites(favs)
}

// ── 核心操作 ──────────────────────────────────────────────────────────────

/** 获取收藏图片的唯一标识（优先用 URL，因为 id 可能是不唯一的索引值如 "0"） */
export function getFavoriteId(img: { id?: string; url: string; originalUrl?: string }): string {
  return img.originalUrl || img.url || img.id || ''
}

/** 获取所有收藏 */
export function getFavorites(): FavoriteImage[] {
  return loadFavorites()
}

/** 按标签筛选收藏 */
export function getFavoritesByTag(tag: string): FavoriteImage[] {
  return loadFavorites().filter(f => f.tags?.includes(tag))
}

/** 按分组筛选收藏 */
export function getFavoritesByGroup(group: string): FavoriteImage[] {
  return loadFavorites().filter(f => f.group === group)
}

/** 获取所有分组（从收藏数据中提取） */
export function getAllGroups(): string[] {
  const groups = new Set<string>()
  for (const f of loadFavorites()) {
    if (f.group) groups.add(f.group)
  }
  return [...groups]
}

/** 判断是否已收藏 */
export function isFavorited(imgId: string): boolean {
  return loadFavorites().some(f => f.id === imgId)
}

/** 切换收藏状态，返回新状态 */
export function toggleFavorite(
  img: { id?: string; url: string; originalUrl?: string },
  meta?: { prompt?: string; model?: string; width?: number; height?: number },
): boolean {
  const id = getFavoriteId(img)
  const favorites = loadFavorites()
  const idx = favorites.findIndex(f => f.id === id)
  if (idx >= 0) {
    favorites.splice(idx, 1)
    saveFavorites(favorites)
    return false
  }
  favorites.unshift({
    id,
    url: img.url,
    originalUrl: img.originalUrl,
    favoritedAt: Date.now(),
    prompt: meta?.prompt,
    model: meta?.model,
    width: meta?.width,
    height: meta?.height,
    tags: [],
    group: undefined,
  })
  saveFavorites(favorites)
  return true
}

/** 给收藏图片添加标签 */
export function addTagToFavorite(imgId: string, tag: string): void {
  const favs = loadFavorites()
  const f = favs.find(x => x.id === imgId)
  if (f) {
    if (!f.tags) f.tags = []
    if (!f.tags.includes(tag)) f.tags.push(tag)
    saveFavorites(favs)
  }
  addTag(tag)
}

/** 从收藏图片移除标签 */
export function removeTagFromFavorite(imgId: string, tag: string): void {
  const favs = loadFavorites()
  const f = favs.find(x => x.id === imgId)
  if (f && f.tags) {
    f.tags = f.tags.filter(t => t !== tag)
    saveFavorites(favs)
  }
}

/** 设置收藏图片的分组 */
export function setFavoriteGroup(imgId: string, group: string | undefined): void {
  const favs = loadFavorites()
  const f = favs.find(x => x.id === imgId)
  if (f) {
    f.group = group
    saveFavorites(favs)
  }
}

/** 移除收藏 */
export function removeFavorite(imgId: string): void {
  saveFavorites(loadFavorites().filter(f => f.id !== imgId))
}

/** 清空所有收藏 */
export function clearFavorites(): void {
  saveFavorites([])
}
