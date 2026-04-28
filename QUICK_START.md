# 🚀 快速开始

## 📦 项目信息

**liang007生图 v0.1.0**
- React + Vite + TypeScript + Tailwind CSS
- AI 图片生成工作台
- MIT License

---

## ⚡ 本地运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

---

## 🔗 上传到 GitHub

### 方法一：GitHub CLI（推荐）

```bash
gh repo create pix-studio --public --source=. --push
```

### 方法二：手动上传

```bash
# 1. 在 GitHub 创建空仓库（不要勾选任何选项）

# 2. 添加远程仓库
git remote add origin https://github.com/YOUR_USERNAME/pix-studio.git

# 3. 推送代码
git push -u origin main
```

---

## 📚 关键文档

- **README.md** - 完整项目文档
- **GITHUB_UPLOAD_GUIDE.md** - 详细上传步骤
- **CONTRIBUTING.md** - 贡献指南
- **CHANGELOG.md** - 变更日志
- **PROJECT_SUMMARY.md** - 项目总结

---

## ✅ 已修复的 BUG

- 🔴 修复模板保存功能失效
- 🔴 修复删除历史记录不同步 localStorage
- 🔴 修复 API 规范默认值错误
- 🟠 修复快捷键 useEffect 依赖缺失
- 🟠 修复 checkApiConnection 第二路径永不执行
- 🟠 修复 balance.ts 双认证头安全风险

---

## 🎯 核心功能

- 🎨 图片生成（OpenAI + Gemini 双规范）
- ✏️ 提示词管理（模板 + 历史）
- ✨ 提示词优化助手
- 💾 本地存储（无需后端）
- ⚙️ 灵活配置（全局 + 模型级）

---

## 🌟 开始使用

1. 配置 API（设置页面）
2. 输入提示词
3. 选择模型和参数
4. 点击生成
5. 下载结果

---

**准备就绪！🎉**
