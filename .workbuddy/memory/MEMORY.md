# MEMORY.md

## 项目技术栈
- Electron + Vite + React + SWC + TypeScript
- 项目路径：C:/Users/PCnine/Desktop/cs1/cur-01/02-2
- 客户项目（cs1/cur-01/02-2）

## App.tsx 重构记录（2026-04-24）

### 目标
拆分 App.tsx（4574 行 monolithic 组件）为独立组件，减少重渲染链路。

### 已完成（第二轮：2026-04-24）
- **AboutDialog**：`components/Dialogs/AboutDialog.tsx`，Zustand 直连，零 props
- **DetailedLogDialog**：`components/Dialogs/DetailedLogDialog.tsx`，Zustand 直连
  - 同时在 `uiStore.ts` 添加了 `setLogEntries()` 函数式更新支持
- **RatioMismatchDialog**：`components/Dialogs/RatioMismatchDialog.tsx`，props 传入 data/onDismiss/onRegenerate
- **BalancePopup**：`components/BalancePopup.tsx`，props: open/balanceStatus/balanceMessage/buttonRef/onClose
- **PerformanceMonitor**：`components/PerformanceMonitor.tsx`，含内嵌拖拽 useEffect，props: open/performanceData/buttonRef/onClose

### 已完成（第三轮：2026-04-24）
- **ImagePreviewModal**：`components/ImagePreviewModal.tsx`，~140行，内嵌缩放/拖拽 state
- **HistoryFullPreview**：`components/HistoryFullPreview.tsx`，~115行，内嵌历史预览缩放/拖拽 state

### 全量清理（2026-04-24 下午）
#### 第一批：零风险清理
- **删除空实现组件**：`ComfyPopup.tsx`、`EnginePopup.tsx`
- **删除硬编码 fallback**：`FALLBACK_MODEL_OPTIONS` 常量
- **提取通用函数**：`createThumbnail` 移到 `utils/imageUtils.ts`

#### 第二批：Legacy 状态清理
- **uiStore.ts 清理**：删除 11 个 Legacy 状态和相关 actions
  - `settingsForm`、`apiCheckStatus`、`testApiStatus`、`modelsFetchStatus`
  - `modelSelectOpen`、`fetchedModelList`、`selectedModelIdsInModal`
  - `modelSearchQuery`、`filterCategoryTag`、`filterVendorTag`、`selectedModelManageOpen`

#### 第三批：组件拆分
- **中药数据库独立**：`data/specimenDatabase.ts` 包含：
  - `SPECIMEN_CONFIGS`、`HERB_DATABASE`、`getRandomHerb`
  - `generateSpecimenPrompt`、`SPECIMEN_TYPE_LIST`、`TEMPLATE_ICONS`
- **LCS 算法独立**：`utils/diffUtils.ts` 包含：
  - `computeDiff`、`DiffSegment`、`ModificationDetail` 类型
- **PromptOptimizerDialog.tsx**：从 3075 行减少约 900 行

#### 第四批：性能监控
- **新增**：`utils/performanceMonitor.ts`
  - `getRealPerformanceData()` - 获取真实性能数据
  - `FPSCalculator` 类 - 实时 FPS 计算
- **更新**：`PerformanceMonitor.tsx` 支持 null 值（GPU/网络延迟不可用时）

### 性能收益（累计）
| 指标 | 重构前 | 全量清理后 |
|------|--------|---------|
| App.tsx 行数 | 4574 | **~3900** |
| PromptOptimizerDialog.tsx | 3075 | **~2175** |
| uiStore.ts Legacy 状态 | 11个 | **0个** |
| 组件模块数 | 44 | 54（+10 独立文件） |

### 关键技术
- **Zustand store 直连**：AboutDialog/DetailedLogDialog 直接 `useUiStore((s)=>s.xxx)` 读取状态
- **getState() 模式**：事件回调中使用 `useUiStore.getState()` 避免订阅开销
- **拖拽逻辑内嵌**：PerformanceMonitor 组件自带拖拽 state 和 useEffect
- **数据/逻辑分离**：中药数据库、LCS 算法独立为纯数据/工具文件
- **真正性能监控**：使用 `requestAnimationFrame` + `performance.memory` 获取真实数据

## Bug 修复（2026-04-29）

### 已完成
1. **统一 localStorage key**：将 App.tsx 中的硬编码字符串替换为 `generationStore.ts` 中的 `STORAGE_KEYS` 常量
2. **修复 historyBtnPosition 随机抖动**：移除 `Math.random()` 抖动，固定使用居中位置
3. **修复 ratioMismatchDialog 闭包陷阱**：添加 `handleGenerateRef` 存储最新函数引用，避免闭包陈旧
4. **修复编译错误**：
   - DraggableHistoryPanel.tsx: 添加 `GeneratedImage` 类型导入，使用类型守卫
   - PromptOptimizerDialog.tsx: 删除重复的 `TEMPLATE_SPECIMEN_HINTS` 声明
   - useAppState.ts: 删除对已删除 Legacy 状态的引用
   - App.tsx: 添加 `httpErrorBody` 到 logEntries 类型，删除未定义的 `setImgZoom`/`setImgOffset`
   - generationStore.ts: 添加 `setError` action 及其类型声明

### 额外清理（2026-04-29 下午）
1. **修复 lint 错误**：
   - 第395行: `any` 类型 → `GeneratedImage`
   - 第2209行: 无用表达式 → 正确 if-else 写法
2. **清理未使用导入**：
   - `testApiGenerate`, `updateCurrentChannel`, `addChannel`, `removeChannel`, `setActiveChannel`
   - `updateApiConfig`, `syncGlobalBaseUrl`, `ApiVendor`, `TestResult`
3. **删除未使用常量**：`DEFAULT_MODEL`

## 主题重新设计（2026-04-29）

### 修改内容
1. **精简主题数量**：10 种 → 8 种精选主题
2. **优化配色**：更现代的渐变配色
3. **应用主题文本颜色**：主界面文本颜色随主题变化

### 新主题列表
| ID | 名称 | 背景渐变 | 强调色 |
|----|------|---------|--------|
| light | 简约白 | slate-50 → slate-200 | #3b82f6 |
| darkBlue | 暗夜蓝 | slate-950 → blue-950 | #3b82f6 |
| purple | 梦幻紫 | violet-50 → fuchsia-50 | #9333ea |
| sunset | 落日橘 | orange-50 → yellow-50 | #f97316 |
| ocean | 海洋蓝 | cyan-50 → blue-50 | #06b6d4 |
| auroraPink | 极光粉 | pink-50 → fuchsia-50 | #ec4899 |
| auroraGreen | 极光绿 | emerald-50 → teal-50 | #10b981 |
| forest | 森林绿 | green-50 → lime-50 | #22c55e |

### 待处理（P0 重构）
- **状态统一**：App.tsx 仍有大量未使用状态变量（Legacy 遗留），需评估是否可安全删除

## 用户偏好
- 指令简短，期望直接执行
- 有 UI 审美，在意细节
- 沟通风格：工程化（错误日志、结构化表格对比）
