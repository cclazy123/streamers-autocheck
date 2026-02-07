const puppeteer = require('puppeteer');
const logger = require('./logger');

// 检查是否处于直播页面
async function isOnLivePage(page) {
  try {
    const url = page.url();
    // 检查URL是否包含/live
    if (!url.includes('/live')) {
      logger.debug(`Not on live page: ${url}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Error checking live page', { error: err.message });
    return false;
  }
}

// 检测是否直播中（多种检测方式）
async function isLiveNow(page, username) {
  try {
    // 方法1: 检查video元素
    const hasVideo = await page.evaluate(() => {
      const videos = document.querySelectorAll('video');
      return videos.length > 0 && Array.from(videos).some(v => v.offsetParent !== null);
    });
    
    logger.debug(`Method 1 (video): ${hasVideo}`, { username });
    if (hasVideo) {
      return true;
    }

    // 方法2: 检查canvas（视频可能在canvas中）
    const hasCanvas = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return canvases.length > 0 && Array.from(canvases).some(c => c.offsetParent !== null);
    });

    logger.debug(`Method 2 (canvas): ${hasCanvas}`, { username });
    if (hasCanvas) {
      return true;
    }

    // 方法3: 检查直播间特定的文本/元素
    const hasLiveIndicator = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const hasLiveText = /live|streaming|正在直播|go live/i.test(pageText);
      
      // 检查页面中是否有 data-testid 包含 "live" 的元素
      const hasLiveElement = document.querySelector('[data-testid*="live"], [class*="live"], [class*="Live"]') !== null;
      
      return hasLiveText || hasLiveElement;
    });

    logger.debug(`Method 3 (live indicator): ${hasLiveIndicator}`, { username });
    if (hasLiveIndicator) {
      return true;
    }

    // 方法4: 检查页面中是否有直播相关的 iframe
    const hasStreamFrame = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      return Array.from(iframes).some(i => 
        i.src.includes('stream') || i.src.includes('live')
      );
    });

    logger.debug(`Method 4 (iframe): ${hasStreamFrame}`, { username });
    if (hasStreamFrame) {
      return true;
    }

    logger.debug(`No live indicators found for ${username}`);
    return false;
  } catch (err) {
    logger.error('Error checking if live', { username, error: err.message });
    return false;
  }
}

// 带重试的检查和截图
async function checkLiveAndCapture(username, maxRetries = 3) {
  let browser = null;
  let lastError = null;

  // 清理用户名：移除前导的 @
  const cleanUsername = username.replace(/^@+/, '').trim();

  logger.info(`Starting live check for: ${cleanUsername}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://www.tiktok.com/@${cleanUsername}/live`;
      
      logger.debug(`Attempt ${attempt}/${maxRetries} - Launching browser for ${cleanUsername}`);

      // 创建浏览器实例，添加更多标志
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-sync',
          '--disable-extensions',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      const page = await browser.newPage();
      
      // 伪装成真实浏览器
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // 添加额外的请求头
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });

      // 设置超时
      page.setDefaultNavigationTimeout(45000);
      page.setDefaultTimeout(45000);

      // 设置视口
      await page.setViewport({ width: 1280, height: 720 });

      logger.debug(`Navigating to ${url}`);

      // 访问页面
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      } catch (navErr) {
        // 如果导航超时但页面有内容，继续
        logger.warn(`Navigation warning for ${cleanUsername}`, { error: navErr.message });
        if (!isOnLivePage(page)) {
          throw new Error(`Failed to navigate to ${url}: ${navErr.message}`);
        }
      }

      logger.debug(`Waiting for page to stabilize`);

      // 等待额外时间让页面完全加载
      await page.waitForTimeout(3000);

      // 检查是否直播
      logger.debug(`Checking if ${cleanUsername} is live`);
      const live = await isLiveNow(page, cleanUsername);

      if (live) {
        logger.info(`✓ Live detected for ${cleanUsername}`);
        // 等待视频加载
        await page.waitForTimeout(2000);
        const buffer = await page.screenshot({ fullPage: false });
        await browser.close();
        return { live: true, buffer };
      } else {
        logger.info(`- Not live: ${cleanUsername}`);
        await browser.close();
        return { live: false };
      }

    } catch (err) {
      lastError = err;
      logger.warn(`Attempt ${attempt}/${maxRetries} failed for ${cleanUsername}`, { 
        error: err.message 
      });
      
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const waitTime = 3000 * attempt;
        logger.debug(`Waiting ${waitTime}ms before retry`, { username: cleanUsername });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // 所有重试都失败
  logger.error(`Failed to check ${cleanUsername} after ${maxRetries} attempts`, {
    error: lastError ? lastError.message : 'Unknown error'
  });
  return { 
    live: false, 
    error: lastError ? lastError.message : 'Unknown error after retries'
  };
}

module.exports = { checkLiveAndCapture };
