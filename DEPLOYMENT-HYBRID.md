# 混合部署指南：本机 + Vercel + Supabase

## 架构

```
┌─────────────────────────────────┐
│ Windows 本机（你的电脑）         │ → 每 20 分钟自动执行
│ • 任务计划程序                   │
│ • Node.js 脚本                   │ → 抓取截图
│ • Puppeteer + Chrome             │ → 上传到 Supabase
└──────────────┬──────────────────┘
               │
               ↓
        ┌─────────────┐
        │  Supabase   │ ← 中央数据库
        │  (数据库)    │
        └──────┬──────┘
               ↑
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────┐          ┌────▼────┐
│ Vercel │          │ 本机浏览器│
│ Web UI │          │(本地访问) │
└────────┘          └──────────┘
```

---

## 部署步骤

### 第一步：本机配置（Windows Task Scheduler）

#### 1.1 检查环境

```powershell
# 验证 Node.js 版本（需 ≥18）
node --version

# 验证项目依赖已安装
npm list puppeteer puppeteer-extra

# 验证本机已登录 TikTok profile
$env:PUPPETEER_USER_DATA_DIR="tmp_chrome_profile"
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node src/check_profile_login.js
```

#### 1.2 注册定时任务

```powershell
# 以管理员身份运行 PowerShell（右键 → 以管理员身份运行）
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 运行 setup 脚本
.\setup-scheduler.ps1
```

脚本会自动：
- 创建名为 `TikTok-Live-Scheduler` 的定时任务
- 设置每 20 分钟执行一次 `scheduler-batch.bat`
- 启用自动重试和网络检查

#### 1.3 验证任务

```powershell
# 查看任务状态
Get-ScheduledTask -TaskName "TikTok-Live-Scheduler" | fl

# 手动执行一次测试
Start-ScheduledTask -TaskName "TikTok-Live-Scheduler"

# 查看日志
Get-Content logs/scheduler-20260207.log -Tail 50
```

---

### 第二步：Vercel 部署（Web UI）

#### 2.1 准备代码

```powershell
# 提交所有更改到 GitHub
git add -A
git commit -m "Setup hybrid deployment: local scheduler + Vercel frontend"
git push origin main
```

#### 2.2 在 Vercel 连接部署

1. 访问 [Vercel.com](https://vercel.com)
2. **New Project** → 连接你的 GitHub 仓库
3. 项目设置：
   - **Framework**: Express.js
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start:vercel`
4. **Environment Variables** → 添加：
   ```
   SUPABASE_URL=<你的 Supabase URL>
   SUPABASE_ANON_KEY=<你的 Anon Key>
   SUPABASE_SERVICE_ROLE_KEY=<你的 Service Role Key>
   ADMIN_PASSWORD=<管理员密码>
   LOG_LEVEL=INFO
   ```
5. 点击 **Deploy**

#### 2.3 验证部署

```
访问 Vercel 上的 URL（例如 https://your-project.vercel.app）
输入密码登录 → 确认可以看到账号和截图
```

---

### 第三步：本机和 Vercel 间的数据同步

#### ✅ 数据流向

```
本机 (每 20 分钟执行)
  ↓
  node src/scheduler-worker.js
  ↓
  检测直播 → 截图 → 上传 Supabase
  ↓
  Supabase (所有数据实时同步)
  ↓
  Vercel Web UI (实时显示)
```

#### ✅ 验证同步

1. **本机执行一次抓图**：
```powershell
$env:PUPPETEER_USER_DATA_DIR="tmp_chrome_profile"
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node src/scheduler-worker.js
```

2. **在 Vercel 上查看**：
   - 打开 Vercel 的 Web UI
   - 检查是否出现新的截图

3. **检查 Supabase**：
   - 访问 Supabase Dashboard
   - 查看 `screenshots` 表是否有新记录

---

## 日常操作

### 查看本机任务运行情况

```powershell
# 查看最新 20 条日志
Get-Content logs/scheduler-*.log -Tail 20

# 实时监控日志（需要 PowerShell 7+ 或使用 Get-Content -Wait）
Get-Content logs/scheduler-20260207.log -Tail 10 -Wait
```

### 临时停止/启动任务

```powershell
# 停止任务
Stop-ScheduledTask -TaskName "TikTok-Live-Scheduler"

# 启动任务
Start-ScheduledTask -TaskName "TikTok-Live-Scheduler"

# 禁用任务（不会自动执行）
Disable-ScheduledTask -TaskName "TikTok-Live-Scheduler"

# 启用任务
Enable-ScheduledTask -TaskName "TikTok-Live-Scheduler"
```

### 手动执行一次抓图

```powershell
node src/scheduler-worker.js
```

### 添加新账号

1. 打开 Vercel 上的 Web UI
2. 输入用户名 + 选择国家
3. 点击 "Add"
4. 本机任务会在下一个 20 分钟周期自动抓取

---

## 故障排查

### ❌ 本机任务没有执行

```powershell
# 1. 检查任务状态
Get-ScheduledTask -TaskName "TikTok-Live-Scheduler" | fl

# 2. 检查任务历史
Get-ScheduledTaskInfo -TaskName "TikTok-Live-Scheduler"

# 3. 手动执行测试
Start-ScheduledTask -TaskName "TikTok-Live-Scheduler"

# 4. 查看日志
Get-Content logs/scheduler-batch.log
```

### ❌ 截图没有上传到 Supabase

```powershell
# 检查 Supabase 连接
# 检查 .env 文件中的密钥是否正确
# 运行测试脚本
$env:SUPABASE_URL="<URL>"
$env:SUPABASE_SERVICE_ROLE_KEY="<KEY>"
node src/scheduler-worker.js
```

### ❌ Vercel Web UI 无法访问

```
1. 检查 Vercel Dashboard 的部署状态
2. 检查环境变量是否正确设置
3. 查看 Vercel Logs 中的错误信息
```

---

## 环境变量总结

### 本机 (.env)
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx
ADMIN_PASSWORD=your_password
LOG_LEVEL=INFO
PUPPETEER_USER_DATA_DIR=tmp_chrome_profile
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
PORT=3000
```

### Vercel (Environment Variables)
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PASSWORD
LOG_LEVEL
```

---

## 本机 vs Vercel 职责划分

| 组件 | 本机 | Vercel |
|------|------|--------|
| **Web UI** | ✅ (本地访问) | ✅ (全球访问) |
| **API - 账号管理** | ⚠️ | ✅ |
| **API - 截图查询** | ⚠️ | ✅ |
| **Puppeteer 抓图** | ✅ (20分钟执行) | ❌ |
| **定时任务** | ✅ (Task Scheduler) | ❌ |
| **数据库** | 🟰 Supabase (共用) | 🟰 Supabase (共用) |

---

## 成本分析

| 服务 | 成本 | 用途 |
|------|------|------|
| **本机** | 💰 0 | 运行 Puppeteer 抓图、存储 Chrome profile |
| **Supabase** | 💰 free | 1GB 数据库、5GB 存储（免费额度足够）|
| **Vercel** | 💰 0 | Web UI + API（免费额度足够）|
| **总计** | 💰 **0** | ✅ 完全免费！ |

---

## 总结

✅ **优点：**
- 本机稳定运行 Puppeteer（无冷启动）
- Web UI 遍布全球（Vercel CDN）
- 数据集中（Supabase）
- 完全免费
- 架构清晰，易维护

⚠️ **需要注意：**
- 本机需要持续开机
- 如需关闭本机，截图采集会中断（Web UI 仍可正常查看历史数据）
