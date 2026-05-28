# Infinite-Canvas 直接移植说明

## 当前移植方式

本次已改为直接移植 `hero8152/Infinite-Canvas` 的原版 `static` 前端，而不是继续使用 liang007 原来的 React SmartCanvas 重写实现。

- 原版静态前端位置：`client/public/infinite-canvas/`
- Electron 本地兼容服务：`electron/services/infiniteCanvasServer.js`
- Electron 主窗口加载地址：`http://127.0.0.1:17438/`
- 原 React `InfiniteCanvas` 入口已改为 iframe 加载本地服务的 `/static/smart-canvas.html`
- Electron 主窗口现在优先直接加载 Infinite-Canvas 原版 shell，而不是 Vite React shell
- `electron:dev` 已改为直接执行 `electron .`，不再等待 Vite dev server

## 保留的 Infinite-Canvas 结构

已复制并保留原项目 `static` 目录结构：

- `index.html`
- `smart-canvas.html`
- `canvas.html`
- `api-settings.html`
- `online.html`
- `zimage.html`
- `klein.html`
- `angle.html`
- `gpt-chat.html`
- `enhance.html`
- `js/`
- `css/`
- `images/`
- `runninghub/`
- `vendor/`

静态资源通过 Electron 内置 HTTP 服务按原版路径 `/static/*` 提供，以最大限度保留原项目页面结构、脚本加载方式和交互体验。

## 与 liang007 的最小适配

新增 `electron/services/infiniteCanvasServer.js`，提供原版页面期望的接口：

- `/api/config`
- `/api/providers`
- `/api/models`
- `/api/canvases`
- `/api/asset-library`
- `/api/ai/upload`
- `/api/online-image`
- `/api/canvas-image-tasks`
- `/generate`
- `/api/ms/generate`
- `/api/angle/generate`
- `/api/runninghub/*`
- `/ws/stats`

这些接口转接到 liang007 现有 Electron 服务：

- `ApiServiceManager`
- `ProviderConfigStore`
- `AssetLibraryService`
- `CanvasStateService`
- `UpdateChecker`

本轮优化补齐：

- `/static/*`、`/vendor/*`、`/js/*`、`/css/*`、`/images/*`、`/runninghub/*` 静态映射
- OPTIONS/CORS 响应头
- `/api/canvas-assets/check`
- `/api/canvas-assets/download`
- `/api/smart-canvas/group-export`
- `/api/update-from-github` 禁用响应
- `/api/update-backups`
- `/api/update-rollback`
- 原版 `title/nodes/connections/viewport` 与 liang007 `name/metadata.smartNodes/metadata.smartConnections` 的画布格式双向转换

## ComfyUI 删除/禁用内容

已删除 copied static 中的 ComfyUI 页面和入口：

- `client/public/infinite-canvas/comfyui-settings.html`
- `client/public/infinite-canvas/js/comfyui-settings.js`
- `client/public/infinite-canvas/css/comfyui-settings.css`

已移除可见入口/文案：

- 主侧栏的工作流设置按钮
- `smart-canvas.html` 的 `comfy` engine 选项
- `canvas.html` 的 ComfyUI 节点按钮
- `i18n.js` 中的 `comfyui-settings.js` 加载项
- i18n 中可见 ComfyUI 文案
- 旧画布中可触发的 `comfy` 菜单项
- 旧画布生成类型列表中的 `comfy`

已验证以下显式可见 ComfyUI 文案/入口搜索为 0：

- `comfyui-settings`
- `ComfyUI 生成`
- `Run ComfyUI`
- `ComfyUI Mode`
- `ComfyUI生成`
- `engine === 'comfy'`
- `settings.engine === 'comfy'`
- `node.type === 'comfy'`
- `type === 'comfy'`

说明：原版超大 JS 文件中仍保留部分历史函数名，例如 `renderComfyBody`、`ensureComfyWorkflow` 等，但当前入口、菜单、engine、运行类型和执行分支已移除/不可触达。未复制 `workflows/` 目录，也没有引入任何 ComfyUI 依赖。

## 修改过的关键文件

- `electron/main.js`
  - 启动 `InfiniteCanvasServer`
  - 主窗口加载 `http://127.0.0.1:17438/`

- `electron/services/infiniteCanvasServer.js`
  - 新增：服务原版 static
  - 新增：兼容 Infinite-Canvas `/api/*` 路由
  - 对接 liang007 生图、画布、资产、Provider 服务

- `client/src/components/InfiniteCanvas/index.tsx`
  - 不再导入 React SmartCanvas
  - 改为 iframe 加载 `/static/smart-canvas.html`

- `client/public/infinite-canvas/index.html`
  - 移除 ComfyUI 设置页入口
  - 移除 ComfyUI iframe

- `client/public/infinite-canvas/smart-canvas.html`
  - 移除 `comfy` engine option

- `client/public/infinite-canvas/canvas.html`
  - 移除 ComfyUI 节点按钮

- `client/public/infinite-canvas/js/canvas.js`
  - 移除可触发的 `comfy` 创建/运行入口
  - 旧 `comfy` 类型不再进入生成类型列表

- `client/public/infinite-canvas/js/smart-canvas.js`
  - `comfy` engine 降级为 `api`
  - 移除 `engine === 'comfy'` 执行分支

- `client/public/infinite-canvas/js/i18n.js`
  - 移除 `comfyui-settings.js` 加载

- `client/public/infinite-canvas/js/i18n/canvas.js`
  - 移除 ComfyUI 可见文案

- `client/public/infinite-canvas/js/i18n/smart-canvas.js`
  - 移除 ComfyUI engine 和错误文案

## 验证命令

已执行并通过：

```bash
node --check electron/services/infiniteCanvasServer.js
node --check electron/main.js
npm run build
```
