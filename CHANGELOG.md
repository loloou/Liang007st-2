# 项目变更日志

所有项目的重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-03-17

### 新增
- 🎨 liang007生图核心功能
  - 支持 OpenAI 规范 API (`/v1/images/generations`)
  - 支持 Gemini 规范 API (`/v1beta/models/...:generateContent`)
  - 批量生成、自定义尺寸、模型选择
- ✏️ 提示词管理
  - 正向/反向提示词双输入
  - 模板系统（预设 + 自定义）
  - 历史记录自动保存
  - 快速选择和重用
- 🎯 提示词优化助手
  - 集成 Chat 模型优化提示词
  - 文本对比显示（删除线 + 下划线）
  - 优化记录保存和恢复
  - 规则模板自定义
  - 快捷键支持（Ctrl+C, Ctrl+R, Esc）
- 💾 配置管理
  - 全局配置（Base URL, API Key）
  - 模型级配置覆盖
  - 多服务商预设
  - 本地 localStorage 持久化
- 🔧 高级功能
  - API 连接测试
  - 模型列表自动获取
  - 余额查询（部分服务商）
  - 图片下载和缩略图

### 优化
- 🎨 现代化 UI 设计
  - 玻璃拟态风格
  - 流畅动画效果
  - 响应式布局
- ⚡ 性能优化
  - Vite 快速构建
  - 懒加载优化
  - 防抖/节流处理
- 🔒 安全性
  - API Key 本地存储
  - 超时控制（生图 60s）
  - 错误处理和提示

### 修复
- 🔴 修复模板保存功能失效（条件判断逻辑错误）
- 🔴 修复删除历史记录不同步 localStorage
- 🔴 修复 API 规范默认值错误
- 🟠 修复快捷键 useEffect 依赖缺失
- 🟠 修复 checkApiConnection 第二路径永不执行
- 🟠 修复 balance.ts 双认证头安全风险

### 技术栈
- React 18.3.1
- TypeScript 5.6
- Vite 6.0
- Tailwind CSS 3.4
- ESLint 9.10

## [未来计划]

### 计划中
- [ ] 后端服务器（可选）
- [ ] 用户认证系统
- [ ] 云端同步功能
- [ ] 更多模型支持
- [ ] 批量下载功能
- [ ] 图片编辑功能
- [ ] 移动端适配
