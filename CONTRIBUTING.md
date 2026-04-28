# 贡献指南

感谢你有兴趣为 Pix 生图工作室做出贡献！

## 📋 目录

- [代码规范](#代码规范)
- [开发流程](#开发流程)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)

## 💻 代码规范

### TypeScript

- 使用 TypeScript 编写所有新代码
- 避免使用 `any` 类型，优先使用明确的类型定义
- 使用接口（Interface）或类型别名（Type）定义数据结构

### React

- 使用函数组件和 Hooks
- 组件文件使用 PascalCase 命名（如 `ImageCard.tsx`）
- Hook 文件使用 camelCase 命名（如 `useImageGeneration.ts`）

### 命名规范

- **变量和函数**: camelCase (`handleClick`)
- **常量**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **组件**: PascalCase (`ImageGallery`)
- **文件名**: 与导出的主要内容命名一致

### 代码风格

- 使用 2 空格缩进
- 使用单引号（`'`）
- 每行最大长度 100 字符
- 必要时添加注释解释复杂逻辑

## 🔄 开发流程

### 1. Fork 仓库

点击 GitHub 页面右上角的 "Fork" 按钮

### 2. 克隆仓库

```bash
git clone https://github.com/your-username/pix-studio.git
cd pix-studio
```

### 3. 创建开发分支

```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

### 4. 安装依赖

```bash
npm install
```

### 5. 启动开发服务器

```bash
npm run dev
```

### 6. 编写代码

- 遵循代码规范
- 添加必要的注释
- 确保代码通过 ESLint 检查

### 7. 测试

```bash
# 运行代码检查
npm run lint

# 构建项目确保无错误
npm run build
```

## 📝 提交规范

### Commit Message 格式

使用 Conventional Commits 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整（不影响功能）
- `refactor`: 重构（不是新功能也不是修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具链相关

### 示例

```bash
feat(api): 添加图片生成 API 调用
fix(ui): 修复模板保存按钮点击无响应
docs(readme): 更新安装指南
refactor(core): 重构提示词优化逻辑
```

### 提交步骤

```bash
# 添加文件
git add .

# 提交
git commit -m "feat: 添加新功能"

# 推送到远程
git push origin feature/your-feature-name
```

## 🔀 Pull Request 流程

### 1. 确保代码最新

```bash
git fetch upstream
git rebase upstream/main
```

### 2. 推送到远程

```bash
git push origin feature/your-feature-name
```

### 3. 创建 Pull Request

1. 访问 GitHub 仓库页面
2. 点击 "Pull Requests" → "New Pull Request"
3. 选择你的分支
4. 填写 PR 信息：
   - 标题：清晰描述改动内容
   - 描述：详细说明改动原因、实现方式、测试情况
   - 关联相关 Issue（如果有）

### 4. 等待 Code Review

- 维护者会进行代码审查
- 根据反馈进行修改
- 通过后合并到主分支

## 🐛 报告 Bug

使用 GitHub Issues 报告 Bug，请提供：

1. **Bug 描述**: 清晰描述问题
2. **复现步骤**: 详细说明如何复现
3. **期望行为**: 期望的正确结果
4. **环境信息**:
   - 操作系统
   - 浏览器版本
   - Node.js 版本
5. **截图/日志**: 相关的截图或错误日志

## 💡 功能建议

欢迎提出功能建议！

使用 GitHub Issues 提交建议，请描述：

1. **功能描述**: 清晰说明建议的功能
2. **使用场景**: 什么时候会用到这个功能
3. **期望效果**: 期望的用户体验
4. **替代方案**: 现有的替代方案（如果有）

## 📧 联系方式

如有问题，可以通过以下方式联系：

- GitHub Issues: [提交问题](https://github.com/your-username/pix-studio/issues)
- GitHub Discussions: [参与讨论](https://github.com/your-username/pix-studio/discussions)

---

再次感谢你的贡献！🎉
