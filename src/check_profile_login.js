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
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    };

    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      launchOpts.executablePath = process.env.CHROME_PATH;
    }

    console.log(`Launching browser with profile: ${userDataDir}`);
    const browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('https://www.tiktok.com/', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Heuristic checks for logged-in state
    const status = await page.evaluate(() => {
      // common indicators
      const hasAvatar = !!document.querySelector('img[src*="avatar"], [data-e2e*="user-avatar"]');
      const hasProfileMenu = !!document.querySelector('[data-e2e*="user-menu"], [data-testid*="user"]');
      const hasLoginButton = !!Array.from(document.querySelectorAll('button, a')).find(n => /log in|sign in|登陆|登录/i.test(n.innerText || ''));
      return { hasAvatar, hasProfileMenu, hasLoginButton, innerTextSample: (document.body.innerText || '').slice(0,200) };
    });

    console.log('Profile check result:', status);

    if (status.hasAvatar || status.hasProfileMenu) {
      console.log('=> Profile appears to be logged in (cookies/localStorage likely present).');
      await browser.close();
      process.exit(0);
    }

    if (status.hasLoginButton) {
      console.log('=> Profile appears NOT logged in (login button visible).');
      console.log('Open Chrome with the same profile and sign in to TikTok, then re-run this script.');
      await browser.close();
      process.exit(1);
    }

    console.log('=> Unable to determine login state reliably. Inspect the opened browser window manually.');
    await browser.close();
    process.exit(3);
  } catch (err) {
    console.error('Error checking profile login:', err.message);
    process.exit(4);
  }
})();
