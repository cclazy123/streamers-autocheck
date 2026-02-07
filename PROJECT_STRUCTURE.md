# 项目结构说明

## 📁 目录树
```
streamers-autocheck/
├── src/                          # 后端源代码
│   ├── index.js                 # Express 服务器和所有API
│   ├── db.js                    # Supabase 客户端配置
│   ├── scheduler.js             # 自动检查调度器（改进版）
│   ├── tiktok.js                # TikTok 直播检测和截图（改进版）
│   ├── setup.js                 # 初始化设置（存储桶创建）
│   ├── auth.js                  # ✨ NEW: 认证和授权
│   ├── queue.js                 # ✨ NEW: 任务队列管理器
│   └── logger.js                # ✨ NEW: 日志记录系统
│
├── public/                       # 前端静态文件
│   ├── index.html               # HTML（完全重设计）
│   └── app.js                   # JavaScript（完全重写）
│
├── logs/                         # 📁 日志文件目录（自动创建）
│   └── scheduler-YYYYMMDD.log   # 按日期的日志文件
│
├── package.json                 # 依赖配置（无需修改）
├── .env.example                 # 环境变量模板（已更新）
├── .gitignore                   # Git 忽略配置
├── database.sql                 # ✨ NEW: 完整数据库初始化SQL
├── README.md                    # 原始项目说明（已更新）
├── IMPROVEMENTS.md              # ✨ NEW: 详细改进文档
└── QUICKSTART.md                # ✨ NEW: 快速开始指南
```

## 📝 文件说明

### 后端文件 (src/)

#### index.js
**变化**: 完全重写，添加了认证和监控功能
```javascript
- 登陆/登出 API
- 账号管理 API (增删改查)
- 截图管理 API (增删改查)
- 日志和监控 API
- 诊断信息 API
- 请求日志中间件
```

#### scheduler.js
**变化**: 添加队列管理和详细日志
```javascript
- 使用 TaskQueue 管理并发
- 每个任务都有日志记录
- 添加统计信息输出
- 改进的错误处理
```

#### tiktok.js
**变化**: 多方法检测 + 自动重试
```javascript
- isOnLivePage(): URL页面检查
- isLiveNow(): 多方法检测
- checkLiveAndCapture(): 带重试的主函数
- 更好的超时和资源管理
```

#### db.js
**变化**: 无改动（保持原样）

#### setup.js
**变化**: 无改动（保持原样）

#### auth.js ✨ NEW
**新增认证模块**:
```javascript
- generateApiKey()
- validateApiKey()
- generateSessionToken()
- isAuthenticated()
- requireAuth 中间件
```

#### queue.js ✨ NEW
**新增队列管理器**:
```javascript
- TaskQueue 类
- 并发限制
- 自动重试
- 任务统计
- 队列监控
```

#### logger.js ✨ NEW
**新增日志系统**:
```javascript
- 文件日志记录
- 日志级别控制
- 日志轮转机制
- 自动清理旧文件
- 控制台和文件输出
```

### 前端文件 (public/)

#### index.html
**变化**: 完全重设计，模块化结构
```html
- 现代化样式（渐变、卡片、动画）
- 响应式布局（移动端适配）
- 登陆界面
- 账号管理区
- 截图网格展示
- 图片预览模态框
- 状态消息提示
```

#### app.js
**变化**: 完全重写，模块化逻辑
```javascript
- 应用状态管理
- API 辅助函数
- 认证逻辑（登陆/登出）
- UI 更新函数
- 账号管理（增/删）
- 截图管理（查看/评分/删除）
- 事件监听器
- 图片预览功能
```

### 数据库文件

#### database.sql ✨ NEW
**包含**:
- accounts 表
- screenshots 表
- scheduler_logs 表
- ratings 表（可选）
- 所有查询优化索引
- 行级安全 (RLS) 配置
- 自动计算字段

### 文档文件

#### README.md
**更新**:
- 更新的数据库初始化说明
- 新增的 API 文档
- 数据库架构说明
- 功能列表

#### IMPROVEMENTS.md ✨ NEW
**包含**:
- 8个改进项目详细说明
- 新增文件清单
- 修改文件清单
- 部署检查清单
- 安全性改进说明
- 性能改进说明
- 未来改进建议

#### QUICKSTART.md ✨ NEW
**包含**:
- 5分钟快速开始
- 功能演示说明
- 后台工作流程
- 监控和诊断方法
- 常见问题解决
- 安全建议
- 性能优化建议

#### .env.example
**更新**:
- 完整的环境变量模板
- 详细的配置说明
- 安全提示

## 🔄 API 端点总览

### 认证 (新增)
```
POST   /login                      登陆
POST   /logout                     登出
```

### 账号管理
```
GET    /accounts                   获取所有账号
POST   /accounts                   添加新账号 (需认证)
DELETE /accounts/:id               删除账号 (需认证)
```

### 截图管理
```
GET    /screenshots                获取截图列表
POST   /screenshots/:id/rate       为截图评分
DELETE /screenshots/:id            删除截图 (需认证)
```

### 监控和诊断 (新增)
```
GET    /scheduler/logs             获取调度器日志
GET    /scheduler/status           获取调度器状态
GET    /admin/diagnostics          获取诊断信息 (需认证)
GET    /admin/logs                 获取应用日志 (需认证)
```

## 📊 数据库表结构

### accounts (账号表)
```sql
id                  BIGSERIAL PRIMARY KEY
username            TEXT NOT NULL UNIQUE
is_deleted          BOOLEAN DEFAULT false
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
```

### screenshots (截图表)
```sql
id                  BIGSERIAL PRIMARY KEY
username            TEXT NOT NULL (FK)
storage_path        TEXT NOT NULL
public_url          TEXT
is_live             BOOLEAN DEFAULT true
is_deleted          BOOLEAN DEFAULT false
captured_at         TIMESTAMPTZ DEFAULT now()
rating_count        INT DEFAULT 0
rating_sum          INT DEFAULT 0
average_rating      DECIMAL (自动计算)
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
```

### scheduler_logs (任务日志表)
```sql
id                  BIGSERIAL PRIMARY KEY
username            TEXT NOT NULL (FK)
status              TEXT NOT NULL
message             TEXT
screenshot_id       BIGINT (FK)
error_message       TEXT
duration_ms         INT
created_at          TIMESTAMPTZ DEFAULT now()
```

### ratings (评分历史表)
```sql
id                  BIGSERIAL PRIMARY KEY
screenshot_id       BIGINT NOT NULL (FK)
rating              INT (1-5)
rater_ip            TEXT
rater_session_id    TEXT
created_at          TIMESTAMPTZ DEFAULT now()
```

## 🔑 关键改进点总结

| 方面 | 从 | 到 |
|------|-----|-----|
| **直播检测** | 单一方法 | 多方法 + 重试 |
| **并发管理** | 无限制 | 队列 + 限制(2) |
| **重试机制** | 无 | 自动重试2次 |
| **日志记录** | 简单console | 文件日志 + 轮转 |
| **安全性** | 无认证 | 密码 + Token认证 |
| **数据库** | 基础表 | 优化索引 + RLS |
| **前端UI** | 基础 | 现代化设计 |
| **监控** | 无 | 诊断API + 详细日志 |
| **文档** | 基础 | 详细说明 |
| **代码质量** | 中等 | 高（模块化、注释完整） |

## 🚀 部署步骤

1. ✅ 配置 .env 文件
2. ✅ 运行 database.sql 初始化数据库
3. ✅ `npm install` 安装依赖
4. ✅ `npm start` 启动服务
5. ✅ 访问 `http://localhost:3000`
6. ✅ 登陆并开始使用

## 📈 性能指标

- **并发限制**: 最多2个同时检查
- **检查间隔**: 每20分钟
- **重试次数**: 失败时自动重试2次
- **日志保留**: 最近10个日志文件
- **单文件大小**: 10MB（自动轮转）

