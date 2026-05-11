# Adapters — 画布实现适配器

本目录存放不同的画布实现。每个实现必须满足 `InfiniteCanvas/types.ts` 中的接口契约。

## 当前实现

- **reactflow/** — 基于 React Flow 的实现（原 Whiteboard 模块）

## 如何添加新实现

1. 在本目录下创建新文件夹（如 `excalidraw/`、`pixijs/`）
2. 实现一个 React 组件，接收 `InfiniteCanvasProps`
3. 组件内部从 `useGenerationStore` 读取生图参数：
   - `model` — 当前模型
   - `resolutionPreset` — 宽高比
   - `sizeTier` — 分辨率档位 (1K/2K/4K)
   - `batchSize` — 出图数量
4. 调用 `generateImages()` 执行生图
5. 修改 `InfiniteCanvas/index.tsx` 的 import 指向新实现

## 参数读取示例

```typescript
import { useGenerationStore } from "../../store/generationStore";
import { generateImages } from "../../api/imageClient";

// 在组件中读取参数
const model = useGenerationStore((s) => s.model);
const resolutionPreset = useGenerationStore((s) => s.resolutionPreset);
const sizeTier = useGenerationStore((s) => s.sizeTier);
const batchSize = useGenerationStore((s) => s.batchSize);

// 调用生图
const result = await generateImages({
  prompt,
  model,
  batchSize,
  width,
  height,
  referenceImages: [],
  resolutionPreset,
  sizeTier,
});
```
