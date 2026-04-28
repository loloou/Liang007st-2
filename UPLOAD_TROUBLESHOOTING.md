# 🔐 GitHub 上传问题排查和解决方案

## 当前问题

- ✅ GitHub 网络连接正常（ping 成功）
- ❌ Git HTTPS 推送失败（443 端口连接失败）
- ❌ Token 已配置但无法连接

---

## 🔧 解决方案

### 方案 1：配置代理（推荐，如果你有 VPN/代理）

如果你使用了代理（如 VPN、Shadowsocks、V2Ray 等），需要配置 Git 使用代理。

#### 查找你的代理端口

常见代理端口：
- Clash: 7890
- V2Ray: 10809
- Shadowsocks: 1080
- 其他：查看你的代理软件设置

#### 配置 Git 代理

假设你的代理端口是 `7890`（HTTP）或 `7891`（SOCKS5）：

```bash
# HTTP 代理
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy https://127.0.0.1:7890

# 或 SOCKS5 代理
git config --global http.proxy socks5://127.0.0.1:7890
git config --global https.proxy socks5://127.0.0.1:7890
```

#### 推送代码

```bash
cd C:/Users/PCnine/Desktop/cs1/cur-01/02-2
git push -u origin main
```

#### 推送成功后取消代理（可选）

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

---

### 方案 2：使用 GitHub Desktop（图形界面）

GitHub Desktop 可能能绕过命令行的连接问题。

#### 步骤

1. 下载 GitHub Desktop：
   https://desktop.github.com/

2. 安装并登录 GitHub

3. 在 GitHub Desktop 中：
   - 点击 "File" → "Add Local Repository"
   - 选择项目目录：`C:/Users/PCnine/Desktop/cs1/cur-01/02-2`
   - 点击 "Add"

4. 推送到 GitHub：
   - 点击 "Publish repository"
   - 填写仓库名称：`Liang007ST`
   - 点击 "Publish repository"

---

### 方案 3：手动上传文件

如果以上方法都失败，可以手动上传。

#### 步骤 1：打包项目

```bash
cd C:/Users/PCnine/Desktop/cs1/cur-01/02-2
# 排除 node_modules（应该已经在 .gitignore 中）
tar -czf pix-studio.tar.gz client/ *.md *.bat package.json .gitignore
```

#### 步骤 2：在 GitHub 上传

1. 访问你的仓库：
   https://github.com/l1366956839-a11y/Liang007ST

2. 点击 "uploading an existing file"

3. 拖拽以下文件到网页：
   - `client/` 文件夹（包含所有源代码）
   - `README.md`
   - `LICENSE`
   - `CHANGELOG.md`
   - `CONTRIBUTING.md`
   - `package.json`
   - `.gitignore`

4. 填写提交信息：
   ```
   initial: upload pix studio project v0.1.0
   ```

5. 点击 "Commit changes"

#### 步骤 3：同步回本地

上传成功后，拉取到本地：

```bash
cd C:/Users/PCnine/Desktop/cs1/cur-01/02-2
git pull origin main
```

---

### 方案 4：检查防火墙/安全软件

某些防火墙或安全软件可能阻止了 Git 的 HTTPS 连接。

#### 检查项

1. **Windows Defender 防火墙**
   - 打开 "Windows Defender 防火墙"
   - 检查是否有阻止 Git 的规则

2. **第三方安全软件**
   - 360、腾讯电脑管家等可能有网络拦截
   - 暂时关闭或添加 Git 到白名单

3. **公司网络**
   - 如果在公司网络，可能需要联系 IT 部门
   - 某些公司禁止使用 GitHub

---

### 方案 5：使用 SSH 方式（推荐长期使用）

SSH 通常比 HTTPS 更稳定，适合频繁推送。

#### 步骤 1：生成 SSH 密钥

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

按 Enter 使用默认路径，密码可以留空。

#### 步骤 2：查看公钥

```bash
cat ~/.ssh/id_ed25519.pub
```

或 Windows：
```bash
type %USERPROFILE%\.ssh\id_ed25519.pub
```

复制输出的内容（以 `ssh-ed25519` 开头）。

#### 步骤 3：添加到 GitHub

1. 访问：https://github.com/settings/keys
2. 点击 "New SSH key"
3. 填写：
   - **Title**: `My Computer` 或任意名称
   - **Key**: 粘贴刚才复制的公钥
4. 点击 "Add SSH key"

#### 步骤 4：切换远程仓库到 SSH

```bash
cd C:/Users/PCnine/Desktop/cs1/cur-01/02-2
git remote set-url origin git@github.com:l1366956839-a11y/Liang007ST.git
git push -u origin main
```

---

## ✅ 推荐操作顺序

### 立即可尝试：

1. **如果你有代理/VPN** → 方案 1（配置 Git 代理）
2. **如果没有代理** → 方案 2（GitHub Desktop）
3. **图形化工具也不行** → 方案 3（手动上传）
4. **想要长期稳定** → 方案 4（SSH 配置）

---

## 🎯 快速测试代理端口

检查你的代理软件正在使用的端口：

- **Clash**: 7890 (HTTP) / 7891 (SOCKS5)
- **V2RayN**: 10809 (HTTP) / 10808 (SOCKS5)
- **Shadowsocks**: 1080
- **其他**: 查看软件设置中的 "允许局域网连接" 端口

找到端口后，执行：

```bash
git config --global http.proxy http://127.0.0.1:你的端口
git config --global https.proxy https://127.0.0.1:你的端口

cd C:/Users/PCnine/Desktop/cs1/cur-01/02-2
git push -u origin main
```

---

## 📞 需要帮助？

### 常见错误

1. **Failed to connect to github.com port 443**
   - 原因：代理未配置或 443 端口被阻止
   - 解决：配置代理或使用 SSH

2. **Connection was reset**
   - 原因：网络不稳定或代理配置错误
   - 解决：检查代理地址和端口是否正确

3. **Authentication failed**
   - 原因：Token 错误或过期
   - 解决：重新生成 token

---

## 🚀 现在就开始

**最快的解决方法**：

1. ✅ 如果你有代理/VPN：配置 Git 代理并推送
2. ✅ 如果没有：使用 GitHub Desktop 或手动上传
3. ✅ 上传成功后：配置 SSH（方案 4），方便将来使用

**请告诉我你使用的是哪个方案，我可以提供更具体的帮助！**
