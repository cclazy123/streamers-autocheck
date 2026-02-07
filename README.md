# TikTok Live Screenshots

Simple service: 用户提交 TikTok 账号名，后台每 20 分钟检查是否直播，若直播则用无头浏览器截图并存入 Supabase，前端可查看截图并评分。

## Quick start

1. 安装依赖：

```bash
cd "%USERPROFILE%\\projects\\streamers-autocheck"
npm install
```

2. 复制 `.env.example` 到 `.env` 并设置 `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`。

3. 在 Supabase SQL editor 中运行 `database.sql` 文件以创建完整的数据库结构：

```bash
# 或直接复制database.sql中的所有SQL语句到Supabase SQL editor执行
```

4. 启动服务：

```bash
npm start
```

## API

### 账号管理
- `POST /accounts` {username} — 添加账号
- `GET /accounts` — 列出所有账号
- `DELETE /accounts/:id` — 删除账号
- `DELETE /accounts/:username` — 按用户名删除账号

### 截图管理
- `GET /screenshots?username=...` — 获取指定账号的截图（支持分页）
  - 可选参数: `limit=20`, `offset=0`
- `GET /screenshots` — 获取所有截图
- `POST /screenshots/:id/rate` {rating} — 为截图评分（1-5）
- `DELETE /screenshots/:id` — 删除截图

### 监控和日志
- `GET /scheduler/logs` — 获取最近的调度器日志
  - 可选参数: `username=...`, `status=...`, `limit=100`
- `GET /scheduler/status` — 获取调度器状态

## Database Schema

数据库包含以下表：

### accounts
存储用户添加的TikTok账号
- `id`: 主键
- `username`: 账号名（唯一）
- `is_deleted`: 软删除标记
- `created_at`: 创建时间
- `updated_at`: 更新时间

### screenshots
存储直播截图信息
- `id`: 主键
- `username`: 关联的账号名
- `storage_path`: Supabase Storage路径
- `public_url`: 公开URL
- `is_live`: 是否为直播截图
- `is_deleted`: 软删除标记
- `captured_at`: 截图时间
- `rating_count`: 评分次数
- `rating_sum`: 评分总和
- `average_rating`: 平均评分（自动计算）

### scheduler_logs
记录每次调度器任务的执行情况
- 跟踪每个账号的检查状态
- 记录错误信息便于调试

### ratings (可选)
如需保存详细的评分历史

## Features

✅ 账号管理（添加、删除、查看）
✅ 自动检查直播状态（每20分钟）
✅ 无头浏览器截图
✅ 截图云存储（Supabase Storage）
✅ 前端展示和筛选
✅ 直播评分和统计
✅ 详细的任务日志
✅ 多重直播检测方式（更稳定）
✅ 自动重试机制
