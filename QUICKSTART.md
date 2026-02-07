# 快速开始指南

## 🚀 5分钟快速部署

### 第1步：环境准备

1. **确保已安装**:
   - Node.js v18+
   - npm 或 yarn

2. **安装项目依赖**:
```bash
cd c:\Users\86424\projects\streamers-autocheck
npm install
```

### 第2步：配置 Supabase

1. **创建 .env 文件**:
```bash
cp .env.example .env
```

2. **编辑 .env 文件**（替换为你的Supabase凭证）:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=your_secure_password
LOG_LEVEL=INFO
PORT=3000
```

### 第3步：初始化数据库

1. **登录 Supabase 控制台**
2. **打开 SQL 编辑器**
3. **复制并执行** `database.sql` 中的所有SQL语句

或者使用命令行：
```bash
# 如果安装了 supabase CLI
supabase db push
```

### 第4步：启动服务

```bash
npm start
```

服务将在 `http://localhost:3000` 启动

### 第5步：访问应用

1. 打开浏览器访问 `http://localhost:3000`
2. 输入密码登陆（默认: `admin123`）
3. 开始添加 TikTok 账号

---

## 📱 功能演示

### 添加账号
1. 点击 "Add" 按钮
2. 输入 TikTok 用户名（不需要@符号）
3. 点击确认

### 查看直播截图
1. 点击账号旁的 "View" 按钮
2. 系统会显示该账号的所有直播截图

### 评分直播
1. 对每个截图点击 1-5 星进行评分
2. 平均评分会实时计算显示

### 管理账号
1. 点击 "Delete" 按钮删除不需要的账号
2. 系统会自动删除该账号的所有截图

---

## ⚙️ 后台工作流程

### 自动检查周期
- **频率**: 每 20 分钟一次
- **时间**: 自动执行，无需手动触发

### 直播检测逻辑
1. 获取所有已添加的账号
2. 访问每个账号的直播间
3. 检测是否正在直播中
4. 如果直播，则自动截图
5. 将截图上传到 Supabase Storage
6. 记录元数据到数据库
7. 记录日志便于诊断

### 重试机制
- 检测失败时自动重试 2 次
- 上传失败时记录错误
- 所有操作都有详细日志

---

## 🔍 监控和诊断

### 查看调度器日志
```bash
curl http://localhost:3000/scheduler/logs
```

或在浏览器中访问（需要session token）

### 查看系统诊断信息
```bash
# 先获取session token
curl -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"password":"admin123"}'

# 然后查看诊断信息
curl -H "X-Session-Token: [your-token]" http://localhost:3000/admin/diagnostics
```

### 查看应用日志
```bash
tail -f logs/scheduler-*.log
```

---

## 🆘 常见问题解决

### 问题：启动时报错 "SUPABASE_URL not set"
**解决**: 检查 .env 文件是否存在且已正确配置
```bash
cat .env
```

### 问题：数据库连接失败
**解决**: 
1. 验证 Supabase URL 和密钥是否正确
2. 检查网络连接
3. 确保数据库表已创建

### 问题：Puppeteer 崩溃或报错
**解决**:
```bash
# 重新安装 Puppeteer
npm install puppeteer@latest

# 清除缓存
rm -rf node_modules/.cache
```

### 问题：截图失败
**解决**:
1. 检查 Supabase Storage 存储桶权限
2. 查看日志确认错误原因
3. 确保账号名输入正确

### 问题：内存使用过高
**解决**:
1. 减少并发数（修改 `src/queue.js` 中的 `maxConcurrent`）
2. 重启服务
3. 检查是否有Puppeteer进程未正常关闭

---

## 🔐 安全建议

### 生产环境部署清单
- [ ] 修改默认密码（`ADMIN_PASSWORD`）
- [ ] 使用强密码（至少12个字符）
- [ ] 启用 HTTPS
- [ ] 配置防火墙限制访问
- [ ] 定期备份数据库
- [ ] 启用日志审计功能
- [ ] 定期更新依赖包
- [ ] 监控服务器资源使用

### 环境变量安全
```bash
# 不要在代码中硬编码敏感信息
# 使用 .env 文件（添加到 .gitignore）
echo ".env" >> .gitignore

# 不要上传 .env 文件到版本控制
git add .gitignore
git commit -m "Add .env to gitignore"
```

---

## 📊 性能优化建议

### 数据库优化
- 定期清理过期的截图（超过30天）
- 建立日期分区策略
- 定期重新索引表

### 并发优化
- 根据服务器能力调整 `maxConcurrent` 参数
- 监控内存使用情况
- 根据负载调整检查频率

### 存储优化
- 定期清理已删除的文件（software delete）
- 压缩旧截图
- 使用CDN加速静态资源

---

## 📞 获取帮助

### 查看日志
```bash
# 查看最近的日志
tail -100 logs/scheduler-*.log

# 搜索错误
grep ERROR logs/scheduler-*.log

# 实时监控
tail -f logs/scheduler-*.log
```

### 查看诊断信息
```bash
curl http://localhost:3000/scheduler/status
```

### 资源
- 📖 完整文档: 查看 `README.md` 和 `IMPROVEMENTS.md`
- 🐛 问题报告: 查看应用日志文件
- 📧 联系支持: 检查项目文档

---

## 🎉 下一步

1. ✅ 部署完成后，前往网页添加你的第一个账号
2. ✅ 等待20分钟进行第一次自动检查
3. ✅ 开始查看和评分直播截图
4. ✅ 监控系统日志和诊断信息

祝使用愉快！🚀
