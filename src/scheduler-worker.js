/**
 * Scheduler Worker - 独立脚本，用于 Windows 任务计划程序每 20 分钟触发一次
 * 职责：检测直播 → 截图 → 上传到 Supabase
 * 不需要 Express、不需要 Cron
 */

require('dotenv').config();
const { checkLiveAndCapture } = require('./tiktok');
const { serviceSupabase } = require('./db');
const logger = require('./logger');

// 并发控制（同时运行最多 2 个账号抓图）
class TaskQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async add(task) {
    if (this.running >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

const taskQueue = new TaskQueue(2);

async function uploadToStorage(username, buffer) {
  const fileName = `${username}_${Date.now()}.png`;
  const { data, error } = await serviceSupabase.storage
    .from('screenshots')
    .upload(`screenshots/${fileName}`, buffer, {
      contentType: 'image/png'
    });

  if (error) {
    logger.error(`Failed to upload to storage: ${username}`, { error: error.message });
    throw error;
  }

  const { data: urlData } = serviceSupabase.storage
    .from('screenshots')
    .getPublicUrl(`screenshots/${fileName}`);

  return urlData.publicUrl;
}

async function processAccount(username) {
  try {
    logger.info(`Processing account: ${username}`);
    
    // 检测是否直播并获取截图
    const res = await checkLiveAndCapture(username);
    
    if (!res.live) {
      logger.info(`Not live: ${username}`);
      return { username, live: false };
    }

    logger.info(`✓ Live detected for ${username}`);

    if (!res.buffer) {
      logger.warn(`No screenshot buffer for ${username}`);
      return { username, live: true, uploaded: false };
    }

    // 上传截图
    const publicUrl = await uploadToStorage(username, res.buffer);
    logger.info(`✓ Screenshot uploaded for ${username}`, { publicUrl });

    // 获取账号信息（包括 country）
    const { data: accountData } = await serviceSupabase
      .from('accounts')
      .select('id, country')
      .eq('username', username)
      .single();

    // 插入截图记录
    const { error: insertErr } = await serviceSupabase
      .from('screenshots')
      .insert([{
        username,
        account_id: accountData?.id || null,
        country: accountData?.country || null,
        public_url: publicUrl,
        captured_at: new Date().toISOString(),
        rating_count: 0,
        rating_sum: 0
      }]);

    if (insertErr) {
      logger.error(`Failed to insert screenshot record: ${username}`, { error: insertErr.message });
      return { username, live: true, uploaded: false };
    }

    logger.info(`✓ Screenshot record saved for ${username}`);
    return { username, live: true, uploaded: true };

  } catch (err) {
    logger.error(`Error processing ${username}`, { error: err.message });
    return { username, error: err.message };
  }
}

async function runOnce() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 检查是否在休眠时间（02:00 - 07:00）
  if (hour >= 2 && hour < 7) {
    logger.info(`Skipping - sleep hours (02:00-07:00)`);
    return;
  }

  logger.info(`Starting check cycle at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);

  // 获取所有账号
  const { data: accounts, error } = await serviceSupabase
    .from('accounts')
    .select('username');

  if (error) {
    logger.error('Failed to fetch accounts', { error: error.message });
    return;
  }

  if (!accounts || accounts.length === 0) {
    logger.info('No accounts to check');
    return;
  }

  logger.info(`Checking ${accounts.length} accounts`);

  // 并发处理所有账号
  const results = await Promise.all(
    accounts.map(a => taskQueue.add(() => processAccount(a.username)))
  );

  const completed = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  logger.info(`Check cycle completed`, { total: accounts.length, completed, failed });
}

// 主入口
async function main() {
  try {
    logger.info('Scheduler Worker started');
    await runOnce();
    logger.info('Scheduler Worker finished');
    process.exit(0);
  } catch (err) {
    logger.error('Scheduler Worker error', { error: err.message });
    process.exit(1);
  }
}

main();
