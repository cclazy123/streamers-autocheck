const puppeteer = require('puppeteer');
const fs = require('fs');

async function run(username) {
  const clean = username.replace(/^@+/, '').trim();
  const url = `https://www.tiktok.com/@${clean}/live`;
  console.log('URL:', url);

  const launchOpts = {
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
      '--disable-blink-features=AutomationControlled',
      '--remote-debugging-port=0'
    ]
  };

  // Improve debugging and startup reliability on Windows
  launchOpts.dumpio = true;
  launchOpts.pipe = true;

  // Allow using an existing Chrome profile by setting env PUPPETEER_USER_DATA_DIR
  if (process.env.PUPPETEER_USER_DATA_DIR) {
    launchOpts.userDataDir = process.env.PUPPETEER_USER_DATA_DIR;
    console.log('Using user data dir:', launchOpts.userDataDir);
  }

  // Allow specifying local Chrome executable via CHROME_PATH
  if (process.env.CHROME_PATH) {
    launchOpts.executablePath = process.env.CHROME_PATH;
    console.log('Using Chrome executable:', launchOpts.executablePath);
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
  } catch (err) {
    console.error('Failed to launch browser:', err && err.message ? err.message : err);
    throw err;
  }

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  page.setDefaultNavigationTimeout(45000);

  try {
    // If there's a cookies.json in project root, load cookies first
    const cookiesPath = './cookies.json';
    if (fs.existsSync(cookiesPath)) {
      try {
        const raw = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(raw);
        if (Array.isArray(cookies) && cookies.length) {
          await page.setCookie(...cookies);
          console.log('Loaded', cookies.length, 'cookies from', cookiesPath);
        }
      } catch (e) {
        console.warn('Failed loading cookies.json:', e.message);
      }
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForTimeout(3000);

    // Full page/viewport screenshot
    const fullPath = `./capture_full_${clean}.png`;
    await page.screenshot({ path: fullPath, fullPage: false });
    console.log('Saved full screenshot:', fullPath, fs.statSync(fullPath).size);

    // Try to find video element
    const videoHandle = await page.$('video');
    if (videoHandle) {
      try {
        // Element screenshot if supported
        const elemPath = `./capture_elem_${clean}.png`;
        await videoHandle.screenshot({ path: elemPath });
        console.log('Saved video element screenshot:', elemPath, fs.statSync(elemPath).size);
      } catch (e) {
        console.warn('element.screenshot() failed:', e.message);
      }

      try {
        // Bounding box crop
        const box = await videoHandle.boundingBox();
        if (box) {
          const clipPath = `./capture_clip_${clean}.png`;
          await page.screenshot({ path: clipPath, clip: {
            x: Math.max(0, Math.floor(box.x)),
            y: Math.max(0, Math.floor(box.y)),
            width: Math.floor(box.width),
            height: Math.floor(box.height)
          }});
          console.log('Saved clipped video screenshot:', clipPath, fs.statSync(clipPath).size);
        } else {
          console.warn('boundingBox returned null');
        }
      } catch (e) {
        console.warn('Bounding box/clip screenshot failed:', e.message);
      }

      try {
        // Canvas extraction from the video element
        const dataUrl = await page.evaluate(async () => {
          const v = document.querySelector('video');
          if (!v) return null;
          const w = v.videoWidth || v.clientWidth;
          const h = v.videoHeight || v.clientHeight;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          try {
            ctx.drawImage(v, 0, 0, w, h);
            return canvas.toDataURL('image/png');
          } catch (err) {
            return { error: err.message };
          }
        });

        if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
          const base64 = dataUrl.split(',')[1];
          const canvasPath = `./capture_canvas_${clean}.png`;
          fs.writeFileSync(canvasPath, Buffer.from(base64, 'base64'));
          console.log('Saved canvas-extracted screenshot:', canvasPath, fs.statSync(canvasPath).size);
        } else {
          console.warn('Canvas extraction returned null or error:', dataUrl && dataUrl.error ? dataUrl.error : dataUrl);
        }
      } catch (e) {
        console.warn('Canvas extraction failed:', e.message);
      }

    } else {
      console.warn('No <video> element found on page');
    }

    // Also try to capture a larger viewport screenshot (simulating mobile)
    try {
      await page.setViewport({ width: 412, height: 915 });
      await page.waitForTimeout(1000);
      const mobilePath = `./capture_mobile_${clean}.png`;
      await page.screenshot({ path: mobilePath, fullPage: false });
      console.log('Saved mobile viewport screenshot:', mobilePath, fs.statSync(mobilePath).size);
    } catch (e) {
      console.warn('Mobile viewport screenshot failed:', e.message);
    }

  } catch (err) {
    console.error('Navigation or capture failed:', err.message);
  } finally {
    try { await browser.close(); } catch (e) {}
  }
}

const username = process.argv[2] || '@yanyangtian.net';
run(username).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
