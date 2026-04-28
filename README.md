# liang007生图

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)

一个基于 **React + Vite + TypeScript + Tailwind CSS** 的现代化 AI 图片生成工作台，提供专业的提示词编辑、模板管理、历史记录等功能。

## ✨ 核心特性

### 🎨 图片生成
- **双规范支持**：兼容 OpenAI (`/v1/images/generations`) 和 Gemini (`/v1beta/models/...:generateContent`) API 规范
- **批量生成**：支持批量参数配置，一次性生成多张图片
- **参数配置**：支持自定义模型、图片尺寸、批量数量等参数
- **参考图上传**：支持上传参考图片辅助生成

### ✏️ 提示词管理
- **正向/反向提示词**：支持正向提示词和反向提示词的双向编辑
- **模板系统**：内置预设模板，支持自定义、编辑、删除模板
- **历史记录**：自动保存生成历史，支持快速重用
- **提示词优化**：集成 Chat 模型，智能优化提示词质量

### 🎯 高级功能
- **提示词优化助手**：调用 Chat 模型优化提示词，支持对比查看差异
- **规则模板**：自定义优化规则，支持设为默认、复制编辑
- **优化记录**：保存优化历史，支持恢复、清空
- **快捷键支持**：Ctrl+C 复制、Ctrl+R 重新生成、Esc 关闭

### 💾 数据持久化
- **本地存储**：所有数据存储在浏览器 localStorage，无需后端
- **配置管理**：支持全局配置和模型级配置
- **多服务商支持**：预设多个服务商配置，支持自定义

## 🚀 快速开始

### 环境要求

- **Node.js**: 18+ (推荐 18 或 20)
- **包管理器**: npm 9+ / pnpm / yarn

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/your-username/pix-studio.git
cd pix-studio

# 安装依赖
npm install
```

### 启动开发服务器

```bash
# 启动开发服务器
npm run dev
```

启动后，在浏览器中访问 `http://localhost:5173`

### 构建生产版本

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

构建产物将输出到 `client/dist` 目录，可由任意静态服务器托管。

## 📖 使用指南

### 配置 API

在应用设置页面配置你的 API 信息：

1. **Global Config**: 全局 Base URL 和 API Key
2. **Chat Models**: 配置用于提示词优化的 Chat 模型
3. **Image Models**: 配置用于图片生成的模型

### 生成图片

1. 在右侧输入正向提示词（必填）
2. 可选输入反向提示词
3. 选择模型、图片尺寸、批量数量等参数
4. 点击「开始生成」按钮

### 提示词优化

1. 输入或选择一个提示词
2. 点击「✨ 优化提示词」按钮
3. 等待优化完成，对比查看差异
4. 点击「采纳结果」应用优化后的提示词

### 管理模板和历史

- 点击「管理」按钮打开管理弹窗
- 支持编辑、删除模板和历史记录
- 支持「清空全部」功能

## 🏗️ 项目结构

```
pix-studio/
├── client/                 # 前端应用
│   ├── src/
│   │   ├── api/           # API 调用封装
│   │   │   ├── imageClient.ts      # 图片生成 API
│   │   │   ├── settings.ts          # 配置管理
│   │   │   ├── models.ts            # 模型列表获取
│   │   │   ├── balance.ts           # 余额查询
│   │   │   └── modelConfig.ts       # 模型配置
│   │   ├── components/    # React 组件
│   │   │   ├── PromptOptimizerDialog.tsx  # 提示词优化弹窗
│   │   │   └── ErrorBoundary.tsx            # 错误边界
│   │   ├── utils/         # 工具函数
│   │   │   ├── download.ts          # 下载功能
│   │   │   ├── resolutionPresets.ts # 尺寸预设
│   │   │   ├── theme.ts             # 主题配置
│   │   │   └── modelCategories.ts   # 模型分类
│   │   ├── App.tsx         # 主应用组件
│   │   ├── main.tsx        # 应用入口
│   │   └── index.css       # 全局样式
│   ├── index.html          # HTML 模板
│   ├── vite.config.ts      # Vite 配置
│   ├── tailwind.config.js  # Tailwind 配置
│   └── tsconfig.json        # TypeScript 配置
├── package.json            # 项目配置
├── README.md               # 项目文档
└── LICENSE                 # MIT 许可证
```

## 🔧 技术栈

- **框架**: React 18.3.1
- **语言**: TypeScript 5.6
- **构建工具**: Vite 6.0
- **样式**: Tailwind CSS 3.4
- **代码规范**: ESLint 9.10

## 📝 开发说明

### 代码规范

项目使用 ESLint 进行代码检查：

```bash
# 运行代码检查
npm run lint
```

### API 对接

当前项目通过 `src/api/imageClient.ts` 统一调用第三方 API：

- 支持 OpenAI 规范的生图 API
- 支持 Gemini 规范的生图 API
- 支持自定义 Base URL 和 API Key
- 内置超时控制（生图 60s，连接测试 15-20s）

### 浏览器兼容性

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 🙏 致谢

感谢所有贡献者和开源社区的支持！

## 📧 联系方式

- Issues: [GitHub Issues](https://github.com/your-username/pix-studio/issues)
- Discussions: [GitHub Discussions](https://github.com/your-username/pix-studio/discussions)

---

**⭐ 如果这个项目对你有帮助，请给个 Star！**
