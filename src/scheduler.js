const cron = require('node-cron');
const { supabase, serviceSupabase } = require('./db');
const { checkLiveAndCapture } = require('./tiktok');
const TaskQueue = require('./queue');
const logger = require('./logger');

// 创建任务队列（改为1个并发，串行执行以保证每个浏览器实例有足够的资源加载视频流）
const taskQueue = new TaskQueue(1);

// 日志记录
async function logSchedulerTask(username, status, message, screenshotId = null, errorMsg = null, durationMs = 0) {
  try {
    await supabase.from('scheduler_logs').insert([{
      username,
      status,
      message,
      screenshot_id: screenshotId,
      error_message: errorMsg,
      duration_ms: durationMs
    }]);
  } catch (err) {
    console.error('Failed to log scheduler task:', err);
  }
}

async function uploadToStorage(filename, buffer) {
  // 清理文件名：替换空格和特殊字符
  const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `screenshots/${safeFilename}`;
  const storageClient = serviceSupabase || supabase;
  
  logger.debug(`Uploading to storage: ${path}, size: ${buffer.length}`);

  const { error } = await storageClient.storage.from('screenshots').upload(path, buffer, {
    contentType: 'image/png',
    upsert: false
  });

  if (error) {
    logger.error('Supabase Storage Upload Error:', error);
    throw error;
  }

  const { data: urlData } = storageClient.storage.from('screenshots').getPublicUrl(path);
  logger.info(`Upload successful: ${urlData.publicUrl}`);
  
  return { path, publicURL: urlData.publicUrl };
}

// 辅助函数：获取账号ID
async function getAccountId(username) {
  try {
    const { data } = await supabase
      .from('accounts')
      .select('id')
      .eq('username', username)
      .single();
    return data ? data.id : null;
  } catch (e) {
    return null;
  }
}

// 内存缓存，记录连续未直播的次数
const notLiveCounter = {};

async function processAccount(username) {
  const startTime = Date.now();
  try {
    // 记录开始
    await logSchedulerTask(username, 'checking', `Starting check for ${username}`);
    logger.info(`Checking account: ${username}`);

    // 获取该账号连续未直播次数
    const consecutiveFailures = notLiveCounter[username] || 0;
    // 如果连续2次没检测到直播，这次进行深度检测（增加重试次数或等待时间）
    const isDeepCheck = consecutiveFailures >= 2;
    if (isDeepCheck) {
      logger.info(`Deep check triggered for ${username} (not live for ${consecutiveFailures} cycles)`);
    }

    // 检查直播和截图（只在直播时才返回 buffer）
    // 如果是深度检测，maxRetries 增加到 5 次 (默认3次)
    const res = await checkLiveAndCapture(username, isDeepCheck ? 5 : 3);

    // ✅ 只有在直播且成功截图时，才上传到 Supabase
    if (res.live && res.buffer) {
      // 重置连续失败计数器
      notLiveCounter[username] = 0;
      
      try {
        const filename = `${username}_${Date.now()}.png`;
        const uploaded = await uploadToStorage(filename, res.buffer);
        
        const client = serviceSupabase || supabase;
        logger.debug(`Using ${serviceSupabase ? 'service' : 'anon'} client for insert`, { username });
        
        const { data: inserted, error: insertError } = await client
                              .from('screenshots')
          .insert([{ 
            username, 
            storage_path: uploaded.path, 
            public_url: uploaded.publicURL,
            // 暂时移除 account_id，以防止因 schema 缓存或数据库列确实不存在导致的错误
            // 如果确实需要 account_id，请确保数据库中已创建该列
            // account_id: (await getAccountId(username)) || null
          }])
          .select();

        if (insertError) throw insertError;

        const durationMs = Date.now() - startTime;
        await logSchedulerTask(
          username, 
          'captured', 
          `Captured and uploaded screenshot for ${username}`,
          inserted[0]?.id,
          null,
          durationMs
        );

        console.log(`✓ Captured and uploaded for ${username} (${durationMs}ms)`);
        logger.info(`Captured screenshot for ${username}`, { durationMs });
        return { success: true, captured: true };
      } catch (uploadErr) {
        const durationMs = Date.now() - startTime;
        await logSchedulerTask(username, 'error', `Upload failed for ${username}`, null, uploadErr.message, durationMs);
        logger.error(`Upload error for ${username}`, { error: uploadErr.message });
        return { success: false, error: uploadErr.message };
      }
    } else {
            // ❌ 账号不直播或无法获取截图 → 不上传任何内容，只记录状态
      // 增加计数器
      notLiveCounter[username] = (notLiveCounter[username] || 0) + 1;
      
      const durationMs = Date.now() - startTime;
      const msg = res.error ? `Not live (${res.error})` : 'Not live';
      await logSchedulerTask(username, 'not_live', msg, null, res.error, durationMs);
      logger.info(`Not live: ${username} (Streak: ${notLiveCounter[username]})`, { error: res.error });
      return { success: true, captured: false };
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logSchedulerTask(username, 'error', `Error processing ${username}`, null, err.message, durationMs);
    logger.error(`Error processing ${username}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

async function runOnce() {
  // 时间限制检查：只在 7:00-凌晨2:00 之间运行检查
  // 允许的时间：7:00-23:59 和 00:00-02:00
  // 禁止的时间：02:00-07:00（凌晨休息时段）
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
      // 检查是否在禁禁时段（2:00-7:00）
  if (hour >= 2 && hour < 7) {
    logger.info(`Sleep mode active (Server time: ${hour}:${minute < 10 ? '0' : ''}${minute}). Active hours: 07:00-02:00.`);
    // 强制返回，不进行任何检查
    return;
  }

  const { data: accounts, error } = await supabase
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

  logger.info(`Starting check cycle for ${accounts.length} accounts at ${hour}:${minute < 10 ? '0' : ''}${minute}...`);

    // 使用队列管理并发处理账号
  const promises = accounts.map(a => 
    taskQueue.add(async (...args) => {
      // 在任务开始前添加 5-10 秒的随机延时，给系统资源回收留出缓冲
      const delay = 5000 + Math.random() * 5000;
      await new Promise(r => setTimeout(r, delay));
      return processAccount(...args);
    }, [a.username], 2)
  );

  try {
    await Promise.all(promises);
  } catch (err) {
    logger.error('Error during batch processing', { error: err.message });
  }

  // 等待所有任务完成
  await taskQueue.drain();

  const stats = taskQueue.getStats();
  logger.info('Check cycle completed', {
    total: stats.total,
    completed: stats.completed,
    failed: stats.failed
  });
}

async function cleanupOldScreenshots(daysToKeep = 20) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysToKeep);
  
  logger.info(`Cleaning up screenshots older than ${daysToKeep} days (before ${dateThreshold.toISOString()})`);

  try {
    const { data: expired, error } = await supabase
      .from('screenshots')
      .select('id, storage_path')
      .lt('created_at', dateThreshold.toISOString()); // 假设数据库有 created_at 字段

    if (error) throw error;
    if (!expired || expired.length === 0) {
      logger.info('No old screenshots to clean up');
      return;
    }

    logger.info(`Found ${expired.length} expired screenshots to remove`);

    // 2. 删除 Storage 文件
    const paths = expired.map(item => item.storage_path).filter(p => p);
    if (paths.length > 0) {
      const storageClient = serviceSupabase || supabase;
      const { error: storageErr } = await storageClient.storage
        .from('screenshots')
        .remove(paths);
      
      if (storageErr) logger.warn('Failed to remove some files from storage', storageErr);
      else logger.info(`Removed ${paths.length} files from storage`);
    }

    // 3. 删除数据库记录
    const ids = expired.map(item => item.id);
    const { error: dbErr } = await supabase
      .from('screenshots')
      .delete()
      .in('id', ids);

    if (dbErr) throw dbErr;
    
    logger.info(`Successfully deleted ${ids.length} records from database`);

  } catch (err) {
    logger.error('Cleanup failed', { error: err.message });
  }
}

function startScheduler() {
  logger.info('Scheduler starting...');
  logger.info(`Task Queue max concurrent: ${taskQueue.maxConcurrent}`);
  logger.info(`Service role available: ${!!serviceSupabase}`);
  
  // 环境变量已通过 .env 配置，用于 Puppeteer 的用户 profile 访问
  if (process.env.PUPPETEER_USER_DATA_DIR) {
    logger.info(`Using user data dir: ${process.env.PUPPETEER_USER_DATA_DIR}`);
  }
  if (process.env.CHROME_PATH) {
    logger.info(`Using Chrome executable: ${process.env.CHROME_PATH}`);
  }
  
  logger.info('Scheduler behavior:');
  logger.info('  - Checks each account every 20 minutes');
  logger.info('  - Only captures & uploads screenshots if account is LIVE');
  logger.info('  - Active hours: 07:00 - 02:00 (sleeping 02:00 - 07:00)');
  logger.info('  - No screenshots uploaded during sleep hours');
  
  // 立即运行一次
  runOnce().catch(err => logger.error('Initial check failed', { error: err.message }));

  // 每20分钟运行一次
  cron.schedule('*/20 * * * *', () => {
    logger.info('Scheduler triggered: checking accounts...');
    runOnce().catch(err => logger.error('Scheduled check failed', { error: err.message }));
  });

    // 每天凌晨 3 点运行清理任务
  cron.schedule('0 3 * * *', () => {
    logger.info('Running daily cleanup...');
    cleanupOldScreenshots(20).catch(err => logger.error('Cleanup task failed', { error: err.message }));
  });

  logger.info('Scheduler ready (running every 20 minutes)');
}

// 导出队列供诊断使用
module.exports = { startScheduler, runOnce, taskQueue };

