const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const userDataDirEnv = process.env.PUPPETEER_USER_DATA_DIR || 'tmp_chrome_profile';
    let userDataDir = userDataDirEnv;
    if (!path.isAbsolute(userDataDir)) userDataDir = path.resolve(process.cwd(), userDataDir);

    if (!fs.existsSync(userDataDir)) {
      console.error(`User data dir not found: ${userDataDir}`);
      process.exit(2);
    }

    const launchOpts = {
      headless: false,
      userDataDir,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    };

    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      launchOpts.executablePath = process.env.CHROME_PATH;
    }

    console.log(`Launching Chrome with profile: ${userDataDir}`);
    const browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');

    console.log('Opening TikTok login page...');
    await page.goto('https://www.tiktok.com/login', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1200);

    // 保存登录页面截图，便于扫码（若二维码在 modal/iframe 中，截图也包含）
    const qrScreenshot = path.join(process.cwd(), 'qr-login.png');
    await page.screenshot({ path: qrScreenshot, fullPage: false });
    console.log(`已打开登录页并保存截图：${qrScreenshot}`);
    console.log('请在弹出的浏览器窗口或截图上扫码以完成登录（最长等待 5 分钟）');

    // 等待用户扫码并登录（轮询检测已登录状态）
    const timeoutMs = 5 * 60 * 1000; // 5 分钟
    const pollInterval = 3000;
    const start = Date.now();
    let loggedIn = false;

    while (Date.now() - start < timeoutMs) {
      // 检查登录态：是否存在头像或用户菜单，或者登录按钮是否消失
      const status = await page.evaluate(() => {
        const hasAvatar = !!document.querySelector('img[src*="avatar"], [data-e2e*="user-avatar"], [alt*="avatar"]');
        const hasProfileMenu = !!document.querySelector('[data-e2e*="user-menu"], [data-testid*="user"], [aria-label*="profile"]');
        const hasLoginButton = !!Array.from(document.querySelectorAll('button, a')).find(n => /log in|sign in|登录|登陆|Sign in|Log in/i.test(n.innerText || ''));
        return { hasAvatar, hasProfileMenu, hasLoginButton };
      });

      if (status.hasAvatar || status.hasProfileMenu) {
        loggedIn = true;
        break;
      }

      const remaining = Math.round((timeoutMs - (Date.now() - start)) / 1000);
      process.stdout.write(`等待扫码登录，剩余 ${remaining}s...\r`);
      await page.waitForTimeout(pollInterval);
    }

    console.log('');
    if (loggedIn) {
      console.log('登录检测到：已成功登录，登录信息已写入 profile。');
      await browser.close();
      process.exit(0);
    } else {
      console.error('登录超时：在 5 分钟内未检测到登录完成。请重试。');
      await browser.close();
      process.exit(1);
    }

  } catch (err) {
    console.error('交互式登录出错：', err.message);
    process.exit(3);
  }
})();
