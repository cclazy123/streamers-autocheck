const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

// 额外等待“视频帧可渲染”信号，避免过早截图
async function waitForRenderableStream(page, username, timeoutMs = 45000) {
  try {
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.readyState >= 3; // HAVE_FUTURE_DATA
    }, { timeout: timeoutMs });
    return true;
  } catch (e) {
    logger.warn(`Stream not confirmed renderable for ${username}: ${e.message}`);
    return false;
  }
}

async function isLikelyBlackScreen(page, buffer, username, minBytes = Number(process.env.MIN_SCREENSHOT_BYTES || 28000)) {
  if (!buffer || buffer.length < minBytes) {
    logger.warn(`Likely black screen for ${username} (size: ${buffer ? buffer.length : 0} < ${minBytes})`);
    return true;
  }
  return false;
}

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

// 从登录 profile 中截图（使用 canvas extraction 和多种备选方案）
async function captureScreenshot(page, username) {
  try {
    // 首先，尝试找到最大的可见容器（通常是直播播放器）
    const containerInfo = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('*')).filter(el => 
        el.clientWidth >= 300 && 
        el.clientHeight >= 300 && 
        el.offsetParent !== null &&
        getComputedStyle(el).visibility !== 'hidden'
      );
      
      containers.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
      
      if (containers.length > 0) {
        const largest = containers[0];
        return {
          width: largest.clientWidth,
          height: largest.clientHeight,
          area: largest.clientWidth * largest.clientHeight,
          position: largest.getBoundingClientRect()
        };
      }
      
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        area: window.innerWidth * window.innerHeight,
        position: { x: 0, y: 0 }
      };
    });

    logger.debug(`Container info: ${containerInfo.width}x${containerInfo.height} (${containerInfo.area}px²)`);

    // 尝试移除可能出现的登录弹窗/遮罩，避免覆盖播放器
    try {
      await page.evaluate(() => {
        try {
          const texts = ['Log in to TikTok', 'Try another browser', 'Sign in', 'Continue to watch'];
          const candidates = Array.from(document.querySelectorAll('div, section, dialog, [role="dialog"]'));
                    candidates.forEach(n => {
            try {
              const txt = (n.innerText || '').slice(0, 200);
              if (texts.some(t => txt.includes(t))) n.remove();
            } catch (e) {
              // ignore
            }
          });

          // 通用遮罩/模态类名
          document.querySelectorAll('.modal, .overlay, .MuiModal-root, [data-e2e*="login"], [data-testid*="login"]').forEach(el => el.remove());

          // 尝试点击关闭按钮
                    Array.from(document.querySelectorAll('button')).forEach(b => {
            try {
              const bt = (b.innerText || '').toLowerCase();
              if (bt.includes('close') || bt === '×' || bt === 'x' || bt.includes('cancel')) {
                b.click();
              }
            } catch (e) {
              // ignore
            }
          });
        } catch (e) {
          // ignore
        }
      });
      // 给页面一点时间来应用变化
      await page.waitForTimeout(200);
    } catch (e) {
      logger.debug('removeLoginModal failed', { error: e.message });
    }

    // 方法1: Canvas Extraction（如果存在视频元素）
    try {
      const dataUrl = await page.evaluate(async () => {
        const v = document.querySelector('video');
        if (!v) {
          console.log('DEBUG: No video element found');
          return null;
        }
        
        const w = v.videoWidth || v.clientWidth;
        const h = v.videoHeight || v.clientHeight;
        console.log(`DEBUG: Video dimensions - ${w}x${h}, readyState: ${v.readyState}`);
        
        if (w <= 0 || h <= 0) {
          console.log('DEBUG: Invalid video dimensions');
          return null;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        
        try {
          // 尝试在 canvas 上绘制视频帧
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(v, 0, 0, w, h);
          
          const dataUrl = canvas.toDataURL('image/png');
          console.log(`DEBUG: Canvas capture successful, size: ${dataUrl.length}`);
          return dataUrl;
        } catch (err) {
          console.log(`DEBUG: Canvas drawImage error: ${err.message}`);
          return null;
        }
      });

      if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
        const base64 = dataUrl.split(',')[1];
        const buffer = Buffer.from(base64, 'base64');
        logger.info(`✓ Canvas extraction succeeded for ${username} (${buffer.length} bytes)`);
        return buffer;
      }
    } catch (e) {
      logger.debug(`Canvas extraction skipped for ${username}: ${e.message}`);
    }

    // 方法2: Large Container Screenshot（针对 WebRTC 流）
    try {
      const largeContainer = await page.evaluate(() => {
        const containers = Array.from(document.querySelectorAll('div')).filter(el =>
          el.clientWidth >= 350 && 
          el.clientHeight >= 350 && 
          el.offsetParent !== null
        );
        containers.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
        
        if (containers.length > 0) {
          const el = containers[0];
          const rect = el.getBoundingClientRect();
          return {
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            width: Math.min(el.clientWidth, window.innerWidth - rect.x),
            height: Math.min(el.clientHeight, window.innerHeight - rect.y)
          };
        }
        return null;
      });

      if (largeContainer && largeContainer.width > 300 && largeContainer.height > 300) {
        const buffer = await page.screenshot({
          clip: {
            x: largeContainer.x,
            y: largeContainer.y,
            width: largeContainer.width,
            height: largeContainer.height
          }
        });
        logger.info(`✓ Container screenshot succeeded for ${username} (${buffer.length} bytes, ${largeContainer.width}x${largeContainer.height})`);
        return buffer;
      }
    } catch (e) {
      logger.debug(`Container screenshot failed for ${username}: ${e.message}`);
    }

    // 方法3: Full Viewport Screenshot
    logger.info(`Using full viewport screenshot for ${username}`);
    const buffer = await page.screenshot({ fullPage: false });
    logger.info(`✓ Viewport screenshot captured for ${username} (${buffer.length} bytes)`);
    return buffer;
  } catch (err) {
    logger.error(`Failed to capture screenshot for ${username}`, { error: err.message });
    return null;
  }
}

async function captureScreenshotWithRetry(page, username, maxCaptureAttempts = 3, minScreenshotBytes = Number(process.env.MIN_SCREENSHOT_BYTES || 28000)) {
  for (let attempt = 1; attempt <= maxCaptureAttempts; attempt++) {
    const buffer = await captureScreenshot(page, username);
    if (!buffer) {
      logger.warn(`Screenshot attempt ${attempt} returned null for ${username}`);
      continue;
    }
    
    const black = await isLikelyBlackScreen(page, buffer, username, minScreenshotBytes);
    if (!black) {
      if (attempt > 1) {
        logger.info(`✓ Recovered non-black screenshot on attempt ${attempt}/${maxCaptureAttempts} for ${username}`);
      }
      return buffer;
    }
    
    if (attempt < maxCaptureAttempts) {
      logger.info(`Retrying capture for ${username} (attempt ${attempt}/${maxCaptureAttempts})`);
      await page.waitForTimeout(2000);
    }
  }
  return null;
}

function normalizeCheckLiveArgs(maxRetriesOrOptions = 3, maybeOptions = {}) {
  let maxRetries = 3;
  let options = {};

  if (typeof maxRetriesOrOptions === 'number') {
    maxRetries = maxRetriesOrOptions;
  } else if (maxRetriesOrOptions && typeof maxRetriesOrOptions === 'object') {
    options = { ...maxRetriesOrOptions };
  }

  if (maybeOptions && typeof maybeOptions === 'object') {
    options = { ...options, ...maybeOptions };
  }

  maxRetries = Number.isFinite(maxRetries) ? maxRetries : 3;
  return { maxRetries, options };
}

// 带重试的检查和截图
async function checkLiveAndCapture(username, maxRetriesOrOptions = 3, maybeOptions = {}) {
  const { maxRetries, options } = normalizeCheckLiveArgs(maxRetriesOrOptions, maybeOptions);

  let browser = null;
  let lastError = null;

  // 清理用户名：移除前导的 @
  const cleanUsername = username.replace(/^@+/, '').trim();

  const runtimePolicy = options.policy || {};
  const dynamicMinScreenshotBytes = Number(runtimePolicy.minScreenshotBytes || process.env.MIN_SCREENSHOT_BYTES || 28000);
  const dynamicCaptureAttempts = Number(runtimePolicy.captureAttempts || 3);

  logger.info(`Starting live check for: ${cleanUsername}`, {
    country: options.country || null,
    minScreenshotBytes: dynamicMinScreenshotBytes,
    captureAttempts: dynamicCaptureAttempts,
    streamWaitLoops: runtimePolicy.streamWaitLoops || null
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://www.tiktok.com/@${cleanUsername}/live`;
      
      logger.debug(`Attempt ${attempt}/${maxRetries} - Launching browser for ${cleanUsername}`);

            // 创建浏览器实例
      // 注意：使用有头模式以支持 WebRTC 流的正确渲染
      const isHeadless = process.env.HEADLESS !== 'false'; // Default to headless=new
      const launchOpts = {
        headless: isHeadless ? 'new' : false, 
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          // 启用 GPU 加速和 WebRTC
          '--enable-gpu',
          '--enable-gpu-compositing',
          '--enable-features=WebRTC',
          // 显示设置
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--no-first-run',
          '--no-default-browser-check',
          // 防止自动化检测
          '--disable-blink-features=AutomationControlled',
        ]
      };

      // 支持从环境变量读取 userDataDir 和 executablePath（用于登录会话）
      let tmpProfileDir = null;
      if (process.env.PUPPETEER_USER_DATA_DIR && fs.existsSync(process.env.PUPPETEER_USER_DATA_DIR)) {
        let userDataDir = process.env.PUPPETEER_USER_DATA_DIR;
        if (!path.isAbsolute(userDataDir)) {
          userDataDir = path.resolve(process.cwd(), userDataDir);
        }
        if (fs.existsSync(userDataDir)) {
          // Copy profile to a temp dir to avoid profile lock when launching multiple browsers
          try {
            tmpProfileDir = path.join(os.tmpdir(), `puppeteer_profile_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
            fs.cpSync(userDataDir, tmpProfileDir, { recursive: true });
            launchOpts.userDataDir = tmpProfileDir;
            logger.debug(`Using temporary user data dir: ${tmpProfileDir}`);
          } catch (e) {
            logger.warn(`Failed to copy user profile, falling back to original: ${e.message}`);
            launchOpts.userDataDir = userDataDir;
          }
        } else {
          logger.warn(`User data dir not found, skipping: ${userDataDir}`);
        }
      }
      if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        launchOpts.executablePath = process.env.CHROME_PATH;
        logger.debug(`Using Chrome executable: ${launchOpts.executablePath}`);
      }

      // Launch with puppeteer-extra (stealth) to reduce automation detection
      browser = await puppeteer.launch(launchOpts);

      const page = await browser.newPage();
      // Apply navigator and feature overrides to evade detection
      await page.evaluateOnNewDocument(() => {
        // Pass the Webdriver test
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // Mock chrome runtime
        window.chrome = window.chrome || { runtime: {} };
        // Languages
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        // Plugins
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      });
      // set common headers
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9'
      });
      
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
        
                        // WebRTC 流需要大量时间和资源来初始化
        // 等待目标：主播的视频应该在浏览器中可见
        // 增加等待时间，从原来的 24s (12*2s) 增加到 40s (20*2s)
        // 如果是深度检测(maxRetries > 3)，则等待时间更长 (30*2s = 60s)
        const waitLoops = Number(runtimePolicy.streamWaitLoops || (maxRetries > 3 ? 30 : 20));
        const totalWaitTime = waitLoops * 2;
        
        for (let waitCount = 0; waitCount < waitLoops; waitCount++) {
          logger.debug(`Waiting for stream... (${(waitCount + 1) * 2}s / ${totalWaitTime}s total)`);
          
          // 在等待过程中尝试模拟鼠标移动，以触发流加载
          try {
            await page.mouse.move(
              100 + Math.random() * 500, 
              100 + Math.random() * 500
            );
            // 偶尔滚动一下页面
            if (waitCount % 3 === 0) {
              await page.evaluate(() => window.scrollBy(0, 10));
            }
          } catch(e) {
            // ignore
          }
          
          await page.waitForTimeout(2000);
        }
        
        // 获取媒体信息用于调试
        const mediaInfo = await page.evaluate(() => {
          const videos = Array.from(document.querySelectorAll('video'));
          const containers = Array.from(document.querySelectorAll('div')).filter(
            el => el.clientWidth >= 300 && el.clientHeight >= 300 && el.offsetParent !== null
          );
          
          return {
            videoCount: videos.length,
            largeContainers: containers.length,
            viewportSize: {
              width: window.innerWidth,
              height: window.innerHeight
            },
            documentSize: {
              width: document.documentElement.clientWidth,
              height: document.documentElement.clientHeight
            }
          };
        });
        
                logger.debug(`Page media status:`, mediaInfo);
        
        // 额外等待“视频帧可渲染”信号，避免过早截图
        const renderableTimeoutMs = Number(runtimePolicy.renderableTimeoutMs || (maxRetries > 3 ? 70000 : 45000));
        const renderable = await waitForRenderableStream(page, cleanUsername, renderableTimeoutMs);
        if (!renderable) {
          logger.warn(`Proceeding with capture fallback for ${cleanUsername} (renderable stream not confirmed)`);
        }

        // 使用优化的截图方法，并加入黑屏识别重试
        const buffer = await captureScreenshotWithRetry(page, cleanUsername, dynamicCaptureAttempts, dynamicMinScreenshotBytes);
        await browser.close();
        // cleanup temporary profile copy
        if (tmpProfileDir && fs.existsSync(tmpProfileDir)) {
          try { fs.rmSync(tmpProfileDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
        }
        return { live: true, buffer };
      } else {
        logger.info(`- Not live: ${cleanUsername}`);
        await browser.close();
        if (tmpProfileDir && fs.existsSync(tmpProfileDir)) {
          try { fs.rmSync(tmpProfileDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
        }
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
