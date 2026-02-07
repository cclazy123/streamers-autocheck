const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const { supabase } = require('./db');
const { startScheduler } = require('./scheduler');
const { ensureBucket } = require('./setup');
const { requireAuth, generateSessionToken } = require('./auth');
const logger = require('./logger');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path}`, { status: res.statusCode, duration });
  });
  next();
});

// =====================
// 认证相关API
// =====================

// 登陆（简单密码认证）
app.post('/login', async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // 比较密码（应使用bcrypt等方式在实际应用中）
  const correctPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password !== correctPassword) {
    logger.warn(`Failed login attempt`, { ip: req.ip });
    return res.status(401).json({ error: 'Invalid password' });
  }

  const sessionToken = generateSessionToken();
  logger.info(`User logged in`, { ip: req.ip });
  res.json({ success: true, session_token: sessionToken });
});

// 登出
app.post('/logout', (req, res) => {
  logger.info(`User logged out`);
  res.json({ success: true });
});

// =====================
// 账号管理API
// =====================

// 添加账号
app.post('/accounts', requireAuth, async (req, res) => {
  let { username, country } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  
  // 清理用户名：移除前导的 @ 并转为小写
  username = username.replace(/^@+/, '').toLowerCase().trim();
  
  if (!username) return res.status(400).json({ error: 'invalid username' });
  
  // 验证国家代码
  const validCountries = ['TH', 'VN', 'PH', 'MY', 'US', 'SG', 'ID'];
  if (country && !validCountries.includes(country.toUpperCase())) {
    return res.status(400).json({ error: `Invalid country. Must be one of: ${validCountries.join(', ')}` });
  }
  
  const countryUpper = country ? country.toUpperCase() : null;
  
  const { data, error } = await supabase
    .from('accounts')
    .insert([{ username, country: countryUpper }])
    .select();
  
  if (error) {
    logger.error(`Failed to add account`, { username, country: countryUpper, error: error.message });
    return res.status(500).json({ error: String(error) });
  }

  logger.info(`Account added`, { username, country: countryUpper });
  res.json(data[0]);
});

// 获取所有账号（支持按国家筛选）
app.get('/accounts', async (req, res) => {
  const { country } = req.query;
  
  let q = supabase
    .from('accounts')
    .select('id, username, country, created_at')
    .order('created_at', { ascending: false });
  
  if (country) {
    q = q.eq('country', country.toUpperCase());
  }
  
  const { data, error } = await q;
  
  if (error) return res.status(500).json({ error: String(error) });
  res.json(data || []);
});

// 删除账号（需要认证）
app.delete('/accounts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
  // 删除账号
  const { data, error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .select();
  
  if (error) {
    logger.error(`Failed to delete account`, { id, error: error.message });
    return res.status(500).json({ error: String(error) });
  }
  
  if (!data || data.length === 0) return res.status(404).json({ error: 'Account not found' });
  
  logger.info(`Account deleted`, { id, username: data[0].username });
  res.json({ success: true, deleted: data[0] });
});

// =====================
// 截图管理API
// =====================

// 获取截图（支持按用户名或国家筛选）
app.get('/screenshots', async (req, res) => {
  const { username, country, limit = 50, offset = 0 } = req.query;
  
  if (country) {
    // 按国家查询：先获取该国家的所有账号，再获取它们的截图
    const { data: accounts, error: accountErr } = await supabase
      .from('accounts')
      .select('username')
      .eq('country', country.toUpperCase());
    
    if (accountErr) {
      logger.error(`Failed to fetch accounts by country`, { country, error: accountErr.message });
      return res.status(500).json({ error: String(accountErr) });
    }
    
    const usernames = accounts.map(a => a.username);
    if (usernames.length === 0) return res.json([]);
    
    let q = supabase
      .from('screenshots')
      .select('id, username, public_url, captured_at, rating_count, rating_sum')
      .in('username', usernames)
      .order('captured_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    const { data, error } = await q;
    if (error) {
      logger.error(`Failed to fetch screenshots by country`, { country, error: error.message });
      return res.status(500).json({ error: String(error) });
    }
    return res.json(data || []);
  }
  
  // 按用户名查询
  let q = supabase
    .from('screenshots')
    .select('id, username, public_url, captured_at, rating_count, rating_sum')
    .order('captured_at', { ascending: false });
  
  if (username) {
    q = q.eq('username', username);
  }
  
  // 应用分页
  q = q.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  const { data, error } = await q;
  
  if (error) {
    logger.error(`Failed to fetch screenshots`, { username, error: error.message });
    return res.status(500).json({ error: String(error) });
  }
  
  res.json(data || []);
});

// 为截图评分
app.post('/screenshots/:id/rate', async (req, res) => {
  const id = req.params.id;
  const { rating } = req.body;
  const r = parseInt(rating || 0, 10);
  
  if (!id || !r || r < 1 || r > 5) {
    return res.status(400).json({ error: 'invalid id or rating' });
  }

  const { data: current, error: fetchErr } = await supabase
    .from('screenshots')
    .select('rating_count, rating_sum')
    .eq('id', id)
    .single();
  
  if (fetchErr) return res.status(500).json({ error: String(fetchErr) });
  
  const newCount = (current.rating_count || 0) + 1;
  const newSum = (current.rating_sum || 0) + r;
  
  const { data, error } = await supabase
    .from('screenshots')
    .update({ rating_count: newCount, rating_sum: newSum })
    .eq('id', id)
    .select();
  
  if (error) {
    logger.error(`Failed to rate screenshot`, { id, rating, error: error.message });
    return res.status(500).json({ error: String(error) });
  }
  
  logger.info(`Screenshot rated`, { id, rating });
  res.json(data[0]);
});

// 删除截图（需要认证）
app.delete('/screenshots/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
  // 删除截图
  const { data, error } = await supabase
    .from('screenshots')
    .delete()
    .eq('id', id)
    .select();
  
  if (error) {
    logger.error(`Failed to delete screenshot`, { id, error: error.message });
    return res.status(500).json({ error: String(error) });
  }
  
  if (!data || data.length === 0) return res.status(404).json({ error: 'Screenshot not found' });
  
  logger.info(`Screenshot deleted`, { id });
  res.json({ success: true, deleted: data[0] });
});

// =====================
// 日志和监控API
// =====================

// 获取调度器日志
app.get('/scheduler/logs', async (req, res) => {
  const { username, status, limit = 100, offset = 0 } = req.query;
  
  let q = supabase
    .from('scheduler_logs')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (username) {
    q = q.eq('username', username);
  }
  
  if (status) {
    q = q.eq('status', status);
  }
  
  q = q.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  const { data, error } = await q;
  
  if (error) {
    logger.error(`Failed to fetch scheduler logs`, { error: error.message });
    return res.status(500).json({ error: String(error) });
  }
  
  res.json(data || []);
});

// 获取调度器状态
app.get('/scheduler/status', async (req, res) => {
  // 获取最近的日志统计
  const { data: recentLogs, error } = await supabase
    .from('scheduler_logs')
    .select('status')
    .order('created_at', { ascending: false })
    .limit(100);
  
  if (error) {
    logger.error(`Failed to fetch scheduler status`, { error: error.message });
    return res.status(500).json({ error: String(error) });
  }

  const counts = {
    captured: 0,
    not_live: 0,
    error: 0,
    checking: 0
  };

  (recentLogs || []).forEach(log => {
    counts[log.status] = (counts[log.status] || 0) + 1;
  });

  res.json({
    status: 'running',
    last_check: recentLogs && recentLogs[0] ? recentLogs[0].created_at : null,
    summary: counts
  });
});

// 获取应用诊断信息（需要认证）
app.get('/admin/diagnostics', requireAuth, async (req, res) => {
  try {
    // 获取账号统计
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('is_deleted', false);

    // 获取截图统计
    const { data: screenshots } = await supabase
      .from('screenshots')
      .select('id')
      .eq('is_deleted', false);

    // 获取最近的错误日志
    const { data: errors } = await supabase
      .from('scheduler_logs')
      .select('*')
      .eq('status', 'error')
      .order('created_at', { ascending: false })
      .limit(10);

    const recentLogs = logger.getRecentLogs(50);

    res.json({
      timestamp: new Date().toISOString(),
      stats: {
        total_accounts: accounts?.length || 0,
        total_screenshots: screenshots?.length || 0,
        recent_errors: errors?.length || 0
      },
      recent_errors: errors || [],
      recent_logs: recentLogs,
      log_files: logger.getLogFiles(),
      environment: {
        node_version: process.version,
        uptime_ms: process.uptime() * 1000,
        memory_usage: process.memoryUsage()
      }
    });
  } catch (err) {
    logger.error(`Failed to fetch diagnostics`, { error: err.message });
    res.status(500).json({ error: String(err) });
  }
});

// 获取应用日志文件（需要认证）
app.get('/admin/logs', requireAuth, (req, res) => {
  const lines = parseInt(req.query.lines) || 100;
  const logs = logger.getRecentLogs(lines);
  res.json({ logs });
});

const PORT = process.env.PORT || 3000;

(async () => {
  logger.info('Starting TikTok Live Screenshots service...');

  const res = await ensureBucket('screenshots');
  if (!res.ok) {
    logger.warn('ensureBucket warning', { error: res.error || 'unknown' });
  } else if (res.created) {
    logger.info('Storage bucket created: screenshots');
  } else {
    logger.info('Storage bucket already exists: screenshots');
  }

  app.listen(PORT, () => {
    logger.info(`Server listening`, { port: PORT, url: `http://localhost:${PORT}` });
    startScheduler();
  });
})();
