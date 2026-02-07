const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

const fs = require('fs');

(async () => {
  const username = process.argv[2] || '@yanyangtian.net';
  const clean = username.replace(/^@+/, '').trim();
  const url = `https://www.tiktok.com/@${clean}/live`;
  console.log('URL:', url);

  const browser = await puppeteerExtra.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  page.setDefaultNavigationTimeout(45000);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForTimeout(4000);

    // Log DOM element counts and keys
    const info = await page.evaluate(() => ({
      videoCount: document.querySelectorAll('video').length,
      iframeCount: document.querySelectorAll('iframe').length,
      bodyText: document.body.innerText.slice(0, 200)
    }));
    console.log('Page info:', info);

    // Save a viewport screenshot
    const fullPath = `./stealth_full_${clean}.png`;
    await page.screenshot({ path: fullPath, fullPage: false });
    console.log('Saved stealth full screenshot:', fullPath, fs.statSync(fullPath).size);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();
