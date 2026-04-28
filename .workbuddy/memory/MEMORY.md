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

## 用户偏好
- 指令简短，期望直接执行
- 有 UI 审美，在意细节
- 沟通风格：工程化（错误日志、结构化表格对比）
