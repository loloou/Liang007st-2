# 完善版局部重绘功能实施计划

## 目标

在当前 Electron + React 生图客户端中新增可用的局部重绘能力，包括结果图入口、蒙版编辑、OpenAI image edit/inpaint API 调用、模型能力配置、错误提示和结果回写。

## 范围

- 新增右键菜单入口：`局部重绘`
- 新增 `InpaintDialog` 蒙版编辑弹窗
- 支持画笔、橡皮、清空、反选、画笔大小、蒙版预览、重绘提示词
- 新增 `inpaintClient.ts` 调用 OpenAI 兼容 `/v1/images/edits`
- 模型配置增加 `supportsInpaint` 与 `inpaintEndpoint`
- 不支持局部重绘的模型给出明确提示
- 重绘结果以新槽位插入结果区，并聚焦显示
- 保持现有普通生图逻辑不变

## 需要修改的文件

- `client/src/api/settings.ts`
- `client/src/api/inpaintClient.ts` 新增
- `client/src/components/InpaintDialog.tsx` 新增
- `client/src/components/ResultPanel.tsx`
- `client/src/components/SettingsDialog.tsx`
- `client/src/App.tsx`

## 数据结构变更

在 `ImageModel` 增加：

```ts
supportsInpaint?: boolean
inpaintEndpoint?: string
```

含义：

- `supportsInpaint`：显式声明模型支持 image edit/inpaint。未勾选时不允许真正局部重绘。
- `inpaintEndpoint`：可选自定义接口。为空时默认由 baseUrl 构造 `/v1/images/edits`。

兼容性：

- 旧配置没有这两个字段时保持 `false/undefined`。
- 不需要迁移 localStorage，只需读取时兼容可选字段。

## API 客户端设计

新增 `client/src/api/inpaintClient.ts`。

导出类型：

```ts
export type InpaintParams = {
  imageUrl: string
  maskDataUrl: string
  prompt: string
  model: string
  width: number
  height: number
  n?: number
  strength?: number
}
```

导出函数：

```ts
export async function inpaintImage(params: InpaintParams): Promise<GenerateResult>
```

行为：

- 从 `getApiConfig()` 找到当前 `activeImageModelId` 或与 `params.model` 匹配的 ImageModel。
- 如果 `apiSpec === 'gemini'` 且未显式配置 `inpaintEndpoint`，返回错误：Gemini generateContent 不支持严格蒙版局部重绘。
- 如果 `supportsInpaint !== true`，返回错误：当前模型未启用局部重绘能力。
- 将 `imageUrl` 转为 PNG Blob。
- 将 `maskDataUrl` 转为 PNG Blob。
- 使用 `FormData` 提交：`model`、`prompt`、`image`、`mask`、`size`、`n`。
- 默认 endpoint：
  - baseUrl 已以 `/v1` 结尾：`${baseUrl}/images/edits`
  - baseUrl 已含 `/images/edits`：直接使用
  - 否则：`${baseUrl}/v1/images/edits`
- 解析常见返回结构：`data[].url`、`data[].b64_json`、`images[]`。
- 对 HTML、非 JSON、HTTP 错误返回清晰中文错误。

注意：

- 远程图片可能因为 CORS 无法 `fetch` 到 Blob。失败时提示用户：请下载图片后重新导入，或使用返回的 base64 原图。
- 当前项目已有 `originalUrl`，局部重绘应优先使用 `originalUrl`。

## 蒙版编辑器设计

新增 `client/src/components/InpaintDialog.tsx`。

Props：

```ts
type InpaintDialogProps = {
  open: boolean
  image: GeneratedImage | null
  model: string
  width: number
  height: number
  onClose: () => void
  onComplete: (images: GeneratedImage[], meta: { prompt: string; endpoint?: string; responseSummary?: string }) => void
}
```

UI：

- 顶部：标题、模型、尺寸、关闭按钮
- 左侧：画布区
- 右侧：控制区
- 底部：提示“白色区域会被重绘，黑色/透明区域会保留”

功能：

- 画笔模式：白色涂抹，表示要重绘
- 橡皮模式：擦除蒙版
- 画笔大小：8-160
- 蒙版透明度：用于可视化 overlay，不影响导出
- 清空蒙版
- 反选蒙版
- 一键填满蒙版
- 重绘提示词输入
- 生成数量：1/2/4
- 生成按钮

Canvas 实现：

- `imageCanvas` 绘制原图
- `maskCanvas` 存储真实 mask，白色区域为重绘区域，透明为保留区域
- 预览层使用 CSS opacity 显示 mask
- pointer 事件支持鼠标/触控笔
- 坐标通过 canvas bounding rect 转换到真实像素
- 导出时生成黑底白 mask，避免部分 API 不接受透明 mask：

```ts
const exportCanvas = document.createElement('canvas')
exportCanvas.width = maskCanvas.width
exportCanvas.height = maskCanvas.height
const ctx = exportCanvas.getContext('2d')!
ctx.fillStyle = '#000'
ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
ctx.drawImage(maskCanvas, 0, 0)
const maskDataUrl = exportCanvas.toDataURL('image/png')
```

## ResultPanel 入口

`Props` 增加：

```ts
onOpenInpaint?: (img: GeneratedImage) => void
```

右键菜单新增按钮：

```tsx
<button onClick={() => { setCtxMenu(null); onOpenInpaint?.(ctxMenu.img) }}>
  局部重绘
</button>
```

应放在“另存为”和“发送到 Eagle”之间。

## App 集成

新增状态：

```ts
const [inpaintTarget, setInpaintTarget] = useState<GeneratedImage | null>(null)
```

传给 ResultPanel：

```tsx
onOpenInpaint={img => setInpaintTarget(img)}
```

渲染弹窗：

```tsx
<InpaintDialog
  open={Boolean(inpaintTarget)}
  image={inpaintTarget}
  model={model}
  width={width}
  height={height}
  onClose={() => setInpaintTarget(null)}
  onComplete={(images, meta) => {
    const slotId = `${Date.now()}-${++slotSeqRef.current}`
    const slot: GenerationSlot = {
      id: slotId,
      request: {
        prompt: `[局部重绘] ${meta.prompt}`,
        negativePrompt: '',
        batchSize: images.length,
        width,
        height,
        model,
        resolutionPreset,
        sizeTier,
        referenceImages: [],
      },
      status: 'success',
      elapsedSeconds: 0,
      progressPct: 100,
      lastDuration: null,
      results: images,
      createdAt: Date.now(),
      hidden: false,
    }
    setGenerationSlots(prev => [slot, ...prev])
    setActiveSlotId(slotId)
    setSlotViewMode('focus')
    setResults(images)
    setResultActiveIdx(0)
    setSelectedImageIds(new Set())
    setInpaintTarget(null)
  }}
/>
```

建议将 `onComplete` 中的图片也生成缩略图，复用现有 `createThumbnail` 逻辑。

## SettingsDialog 修改

Image 模型卡片中增加能力配置行：

- checkbox：`支持局部重绘`
- input：`Inpaint Endpoint（可选）`

示例 UI：

```tsx
<label className="flex items-center gap-1.5 text-[11px] text-slate-400">
  <input
    type="checkbox"
    checked={Boolean(m.supportsInpaint)}
    onChange={e => updateModel(m.id, { supportsInpaint: e.target.checked })}
  />
  支持局部重绘
</label>
<input
  value={m.inpaintEndpoint || ''}
  onChange={e => updateModel(m.id, { inpaintEndpoint: e.target.value })}
  placeholder="Inpaint Endpoint（留空默认 /v1/images/edits）"
/>
```

## 错误提示策略

- 未选择模型：`请先选择支持局部重绘的 Image 模型。`
- Gemini 未配置自定义 endpoint：`Gemini generateContent 不支持严格蒙版局部重绘，请选择支持 /v1/images/edits 的模型。`
- 模型未启用：`当前模型未启用局部重绘，请在设置中勾选“支持局部重绘”。`
- mask 为空：`请先涂抹需要重绘的区域。`
- prompt 为空：`请输入局部重绘提示词。`
- 图片跨域失败：`无法读取原图数据，可能是图片 URL 跨域。请尝试下载后重新导入或使用 base64 返回模型。`
- HTML 响应：`API 返回 HTML 而不是 JSON，请确认 Inpaint Endpoint 是否正确。`

## 验证步骤

执行：

```bash
npm run format --workspace client
npm run lint --workspace client
npm run test --workspace client
npm run build --workspace client
npm audit --workspaces --audit-level=moderate
```

手工验证：

1. 设置中添加 OpenAI 规范图片模型，勾选 `支持局部重绘`。
2. 普通生图得到结果。
3. 右键结果图，点击 `局部重绘`。
4. 在弹窗中涂抹局部区域，输入提示词。
5. 点击生成。
6. 新结果应作为新槽位插入并自动聚焦。
7. 未勾选 `支持局部重绘` 时应给出中文错误。
8. Gemini 模型无自定义 endpoint 时应阻止调用并给出中文错误。

## 风险与限制

- 不同中转站对 `/v1/images/edits` 的字段兼容性不完全一致，可能需要后续按供应商增加 adapter。
- 部分 API 要求 mask 中透明表示重绘，部分要求白色表示重绘；本计划默认黑底白区重绘，后续可增加 `maskMode` 配置。
- 远程图片 URL 跨域会影响浏览器端转 Blob；base64/data URL 最稳定。
- 如果模型本身不支持严格 inpaint，不能用 Gemini 参考图模式冒充局部重绘，否则用户体验会不稳定。
