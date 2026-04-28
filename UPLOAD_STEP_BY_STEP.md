# 📦 GitHub CLI 安装和上传指南

## 情况分析

❌ GitHub CLI (gh) 未安装

有两个选择：
1. **安装 GitHub CLI**（推荐，更快捷）
2. **使用方法二：手动上传**（通用方法）

---

## 🚀 方案一：安装 GitHub CLI（推荐）

### Windows 安装方法

#### 方法 1.1：使用 winget（推荐）

```powershell
winget install --id GitHub.cli
```

#### 方法 1.2：使用 Chocolatey

```powershell
choco install gh
```

#### 方法 1.3：使用 Scoop

```powershell
scoop install gh
```

#### 方法 1.4：手动下载安装

1. 访问 GitHub CLI 发布页面：
   https://github.com/cli/cli/releases/latest

2. 下载 Windows 安装包：
   - 文件名：`gh_X.X.X_windows_amd64.msi`（X.X.X 是版本号）

3. 运行安装程序，按照提示完成安装

4. 验证安装：
```bash
gh --version
```

### 安装后的配置步骤

```bash
# 1. 登录 GitHub
gh auth login

# 按照提示操作：
# - What account do you want to log into? → GitHub.com
# - What is your preferred protocol for Git operations? → HTTPS
# - Authenticate Git with your GitHub credentials? → Yes
# - How would you like to authenticate GitHub CLI? → Login with a web browser

# 2. 测试登录状态
gh auth status

# 3. 创建并推送仓库（一条命令搞定！）
gh repo create pix-studio --public --source=. --push
```

### 如果遇到问题

#### 问题：gh 命令找不到
**解决**：重启终端或计算机

#### 问题：登录失败
**解决**：使用 GitHub 个人访问令牌（PAT）
1. 访问：https://github.com/settings/tokens
2. 创建新令牌，勾选 `repo` 权限
3. 复制令牌
4. 在终端选择 "Login with a token"

---

## 🔗 方案二：手动上传（无需安装工具）

### 步骤 1：在 GitHub 创建仓库

1. 访问 GitHub 新建页面：
   https://github.com/new

2. 填写仓库信息：
   ```
   Repository name: pix-studio
   Description: Pix 生图工作室 - 基于 React + Vite + TypeScript 的 AI 图片生成工作台
   Public: ✅ 公开仓库
   ```

3. ⚠️ **重要**：不要勾选以下选项
   - ❌ Add a README file
   - ❌ Add .gitignore
   - ❌ Choose a license

4. 点击 "Create repository" 按钮

### 步骤 2：连接本地仓库到 GitHub

在项目目录中执行：

```bash
cd C:/Users/PCnine/Desktop/cs1/cur-01/02-2
```

添加远程仓库（**请替换 YOUR_USERNAME**）：

```bash
git remote add origin https://github.com/YOUR_USERNAME/pix-studio.git
```

验证远程仓库：

```bash
git remote -v
```

应该显示：
```
origin  https://github.com/YOUR_USERNAME/pix-studio.git (fetch)
origin  https://github.com/YOUR_USERNAME/pix-studio.git (push)
```

### 步骤 3：推送代码到 GitHub

```bash
# 推送 main 分支到 GitHub
git push -u origin main
```

### 如果遇到错误

#### 错误 1：Updates were rejected
**原因**：远程仓库有初始化文件

**解决**：
```bash
git pull origin main --rebase
git push -u origin main
```

#### 错误 2：remote origin already exists
**原因**：已存在 origin 远程仓库

**解决**：
```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/pix-studio.git
git push -u origin main
```

#### 错误 3：fatal: not a git repository
**原因**：不在正确的目录

**解决**：
```bash
cd C:/Users/PCnine/Desktop/cs1/cur-01/02-2
git push -u origin main
```

#### 错误 4：Authentication failed
**原因**：需要认证

**解决**：
1. 使用 GitHub Personal Access Token (PAT)
   - 访问：https://github.com/settings/tokens
   - 创建新令牌，勾选 `repo` 权限
   - 复制令牌

2. 使用令牌推送：
```bash
git remote set-url origin https://YOUR_TOKEN@github.com/YOUR_USERNAME/pix-studio.git
git push -u origin main
```

---

## ✅ 推送成功后

### 1. 验证上传

访问你的仓库页面：
```
https://github.com/YOUR_USERNAME/pix-studio
```

检查以下内容：
- ✅ 所有文件都已上传
- ✅ README.md 正确显示
- ✅ LICENSE 显示 MIT License
- ✅ 代码文件完整

### 2. 更新 README 链接

编辑 `README.md`，替换占位符：

```markdown
# 替换前
https://github.com/your-username/pix-studio

# 替换后（使用你的实际用户名）
https://github.com/YOUR_USERNAME/pix-studio
```

提交更新：

```bash
git add README.md
git commit -m docs: update README with correct repository links
git push
```

### 3. 创建 Release

1. 访问仓库页面
2. 点击 "Releases" → "Create a new release"
3. 填写信息：
   ```
   Tag version: v0.1.0
   Release title: Pix 生图工作室 v0.1.0 - 初始版本
   ```
4. Description：从 `CHANGELOG.md` 复制 v0.1.0 内容
5. 点击 "Publish release"

### 4. 配置 GitHub Pages（可选）

1. 访问仓库 Settings
2. 滚动到 "GitHub Pages"
3. Source: 选择 `Deploy from a branch`
4. Branch: 选择 `main` → `/ (root)`
5. 点击 "Save"
6. 等待几分钟，访问：
   ```
   https://YOUR_USERNAME.github.io/pix-studio/
   ```

---

## 🎯 推荐操作

### 快速上传（推荐顺序）

1. ✅ **立即执行手动上传**（无需等待）
   - 在 GitHub 创建仓库
   - 推送代码

2. ⬜ **后续安装 GitHub CLI**（可选）
   - 方便将来快速创建仓库
   - 提升开发效率

---

## 📞 需要帮助？

### GitHub 文档
- GitHub CLI: https://cli.github.com/
- Git 文档: https://git-scm.com/doc
- GitHub Help: https://docs.github.com/

### 常见问题页面
- https://docs.github.com/get-started/getting-started-with-git/about-remote-repositories

---

## 🚀 开始上传！

**现在就开始**：

1. 打开 https://github.com/new
2. 创建仓库 `pix-studio`
3. 在项目目录执行：
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/pix-studio.git
   git push -u origin main
   ```

**上传成功后**，你的项目就托管在 GitHub 上了！🎉
