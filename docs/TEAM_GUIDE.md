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

*最后更新：2026-05-15*
