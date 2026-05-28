# 团队技术能力提升指南

> 由资深开发工程师制定，用于提升团队整体技术水平

## 代码质量标准

### TypeScript 最佳实践

```typescript
// ❌ 避免
function getData(url: any): any {
  return fetch(url).then(r => r.json());
}

// ✅ 推荐
interface ApiResponse<T> {
  data: T;
  status: number;
}

async function getData<T>(url: string): Promise<ApiResponse<T>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
```

### React 组件规范

```typescript
// ✅ 使用 TypeScript 定义 Props
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button = memo(({ variant = 'primary', loading, children, onClick }: ButtonProps) => {
  return (
    <button
      className={clsx('btn', `btn-${variant}`, { 'btn-loading': loading })}
      onClick={onClick}
      disabled={loading}
    >
      {children}
    </button>
  );
});
```

---

## 🔍 Code Review 检查清单

### 必查项（Blocking）
- [ ] 是否存在类型 `any` 滥用
- [ ] 是否有未处理的 Promise rejection
- [ ] 是否有内存泄漏风险（未清理的 eventListener/定时器）
- [ ] 敏感信息是否意外提交（API Key、密码等）
- [ ] 是否有明显的性能问题（循环内渲染、不必要的 re-render）

### 建议项（Non-blocking）
- [ ] 变量/函数命名是否清晰
- [ ] 是否有重复代码可以抽取
- [ ] 注释是否必要且准确

---

## 📝 Git 提交规范

采用 Conventional Commits 规范：

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(chat): 添加令牌余额查询` |
| `fix` | Bug 修复 | `fix(canvas): 修复双击事件被ReactFlow吞掉` |
| `refactor` | 重构 | `refactor(theme): 主题系统改为四色方案` |
| `style` | 格式调整 | `style: 统一使用 Prettier 格式化` |
| `perf` | 性能优化 | `perf: 优化无限画布渲染性能` |
| `test` | 测试相关 | `test: 添加主题切换单元测试` |

---

## 🧪 单元测试规范

```typescript
// client/src/utils/__tests__/theme.test.ts
import { describe, it, expect } from 'vitest';
import { getTheme, setTheme, THEMES } from '../theme';

describe('theme utils', () => {
  it('getTheme returns valid theme', () => {
    const theme = getTheme();
    expect(THEMES.map(t => t.id)).toContain(theme);
  });

  it('setTheme updates current theme', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');
  });
});
```

运行测试：
```bash
cd client && npm run test
```

---

## 🛠️ 本地开发工具链

```bash
# 安装依赖
cd client && npm install

# 开发模式
npm run dev

# 代码检查
npm run lint          # ESLint 检查
npm run lint:fix      # 自动修复
npm run format        # Prettier 格式化
npm run type-check    # TypeScript 类型检查
npm run test          # 运行测试
```

---

## API 与无限画布扩展说明

### 标准 API 层

Electron 主进程统一从 `electron/services/api/ApiServiceManager.js` 接收生图任务，并通过 `AdapterFactory` 创建协议适配器。新增后端只需要：

1. 在 `electron/services/api/` 下实现 `AbstractApiAdapter` 子类。
2. 在 `AdapterFactory.js` 注册新的 `protocol`。
3. 在 `electron/services/api/types.js` 和 `client/src/api/ipcBridge.ts` 扩展协议类型。
4. 在 Provider 配置中写入 `baseUrl`、`apiKeys`、`imageModels`、`rateLimitRpm` 与可选 `customEndpoints`。

当前支持：

- `openai`：OpenAI-compatible `/v1/images/generations` 与 `/v1/images/edits`。
- `modelscope`：ModelScope/OpenAI 兼容适配，可通过 `customEndpoints.textToImage` 指向自定义生成端点。
- `custom`：自定义 HTTP，默认复用 OpenAI-compatible 请求/响应解析。
- `gemini`：Gemini generateContent 适配。

任务请求统一字段：`prompt`、`negativePrompt`、`model`、`width`、`height`、`batchSize`、`referenceImages`、`sourceImage`、`mask`、`providerId`、`returnMode`。`returnMode` 可选：

- `base64`：返回 base64/data URL，适合直接进入画布和资产库。
- `localUrl`：下载/写入本地后返回 `localPath`。
- `cloudUrl`：保留上游 URL。

API 服务内置多密钥轮询、RPM 限流、Circuit Breaker、Provider failover、任务队列、状态轮询、WebSocket/IPC 推送、结果缓存与图片清理。

### 多后端配置示例

`providers.json` 会保存在 Electron `userData` 目录，可通过设置页或 IPC 写入，结构示例：

```json
[
  {
    "id": "openai-main",
    "name": "OpenAI Compatible",
    "protocol": "openai",
    "baseUrl": "https://api.example.com/v1",
    "apiKeys": ["sk-xxx", "sk-yyy"],
    "enabled": true,
    "primary": true,
    "imageModels": ["gpt-image-1"],
    "chatModels": [],
    "rateLimitRpm": 60
  },
  {
    "id": "modelscope-fallback",
    "name": "ModelScope",
    "protocol": "modelscope",
    "baseUrl": "https://api-inference.modelscope.cn/v1",
    "apiKeys": ["ms-xxx"],
    "enabled": true,
    "primary": false,
    "imageModels": ["Qwen/Qwen-Image"],
    "chatModels": [],
    "rateLimitRpm": 20
  },
  {
    "id": "custom-http",
    "name": "Custom Image API",
    "protocol": "custom",
    "baseUrl": "https://images.example.com",
    "apiKeys": ["custom-key"],
    "enabled": true,
    "primary": false,
    "imageModels": ["custom-image-v1"],
    "chatModels": [],
    "customEndpoints": {
      "textToImage": "https://images.example.com/v1/images/generations",
      "inpaint": "https://images.example.com/v1/images/edits"
    }
  }
]
```

### 无限画布搭接

`client/src/components/SmartCanvas/SmartCanvas.tsx` 是默认无限画布入口。底部 `CanvasPromptBar` 负责文生图和 `@` 图片引用，所有生成请求统一调用 `electronAPI.apiGenerate`。任务事件通过 `onTaskEvent` 双向绑定到画布节点：

- queued/running/progress：节点显示运行状态和 pending 标记。
- completed：生成结果自动写入对应画布节点并导入资产库。
- failed/cancelled：节点自动标注失败或恢复可操作状态。

资产库 `AssetLibrary` 可在画布内打开，素材支持拖拽回画布形成图片引用节点。资产导入支持 base64、`file://`、本地绝对路径和云 URL，会统一复制到 Electron `userData/assets` 下。

### 启动与部署

- Windows 开发：`start.bat` 或 `启动开发服务器.bat`，默认启动 Vite Web 模式。
- Windows 构建：`build.bat` 或 `npm run electron:build`，输出 portable 包。
- 预览构建产物：`preview.bat` 或 `npm run preview`。
- macOS/Linux：执行 `npm install` 后使用 `npm run dev`、`npm run electron:dev`、`npm run build`；Electron 打包需按目标平台调整 `electron-builder` 参数。

所有启动路径均走统一标准 API 层，不依赖 ComfyUI 本地服务。

### 约束

- 不引入 ComfyUI 协议、workflow、prompt/history/view/upload 逻辑。
- 画布生成入口必须走标准 API 服务，不直接耦合具体后端。
- 新增协议必须通过 Adapter，不允许在 React 组件内拼接后端专用请求。

---

*最后更新：2026-05-26*
