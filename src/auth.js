const { supabase } = require('./db');
const crypto = require('crypto');

// 生成简单的API密钥（用于管理员操作）
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// 验证API密钥
async function validateApiKey(apiKey) {
  if (!apiKey || apiKey.length < 32) {
    return false;
  }
  // 实际实现中应该从数据库中查询，这里简化处理
  return apiKey === process.env.ADMIN_API_KEY;
}

// Session Token（用于前端登陆用户）
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 判断用户是否认证（简单实现）
async function isAuthenticated(req) {
  const token = req.headers['x-session-token'] || req.query.session_token;
  
  if (!token) {
    return false;
  }

  // 简单的token验证逻辑，实际应存储在Redis或数据库中
  // 这里仅作演示
  return token && token.length === 64;
}

// 中间件：检查认证（支持管理员）
function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.session_token || req.body?.session_token;
  
  if (!token || token.length < 32) {
    return res.status(401).json({ error: 'Unauthorized: session token required' });
  }

  // 游客 token 不允许进行修改操作（POST/DELETE 等敏感操作）
  if (token.startsWith('guest_')) {
    return res.status(403).json({ error: 'Forbidden: Guest users cannot perform this action' });
  }

  // 验证token格式或从存储中检查
  req.sessionToken = token;
  next();
}

module.exports = {
  generateApiKey,
  validateApiKey,
  generateSessionToken,
  isAuthenticated,
  requireAuth
};
