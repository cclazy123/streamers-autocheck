/**
 * Express API Server - 仅用于 Web UI 和 API
 * 不包含 Puppeteer、不包含调度器
 * 部署到 Vercel
 */
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const { supabase } = require('./db');
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

app.post('/login', async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const correctPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password !== correctPassword) {
    logger.warn(`Failed login attempt`, { ip: req.ip });
    return res.status(401).json({ error: 'Invalid password' });
  }

  const sessionToken = generateSessionToken();
  logger.info(`User logged in`, { ip: req.ip });
  res.json({ success: true, session_token: sessionToken });
});

app.post('/logout', (req, res) => {
  logger.info(`User logged out`);
  res.json({ success: true });
});

// =====================
// 账号管理API
// =====================

app.post('/accounts', requireAuth, async (req, res) => {
  let { username, country } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  
  username = username.replace(/^@+/, '').toLowerCase().trim();
  
  if (!username) return res.status(400).json({ error: 'invalid username' });
  
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

app.delete('/accounts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
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
// 截图API
// =====================

app.get('/screenshots', async (req, res) => {
  const { username, country, limit = 50, offset = 0 } = req.query;
  
  if (country) {
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
  
  let q = supabase
    .from('screenshots')
    .select('id, username, public_url, captured_at, rating_count, rating_sum')
    .order('captured_at', { ascending: false });
  
  if (username) {
    q = q.eq('username', username);
  }
  
  q = q.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  const { data, error } = await q;
  
  if (error) {
    logger.error(`Failed to fetch screenshots`, { username, error: error.message });
    return res.status(500).json({ error: String(error) });
  }
  
  res.json(data || []);
});

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

app.delete('/screenshots/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
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
// Health Check
// =====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================
// 启动服务器
// =====================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
  logger.info(`Web UI available at http://localhost:${port}`);
});
