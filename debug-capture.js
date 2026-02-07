require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function debugCapture() {
  const username = 'yanyangtian.net';
  let browser = null;

  try {
    const launchOpts = {
      // 使用 headful（有头模式）以便真正渲染 WebRTC 流
      // 但这需要图形显示器
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--enable-gpu',
        '--enable-gpu-compositing',
        '--enable-features=WebRTC',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled',
      ]
    };

    if (process.env.PUPPETEER_USER_DATA_DIR && fs.existsSync(process.env.PUPPETEER_USER_DATA_DIR)) {
      let userDataDir = process.env.PUPPETEER_USER_DATA_DIR;
      if (!path.isAbsolute(userDataDir)) {
        userDataDir = path.resolve(process.cwd(), userDataDir);
      }
      if (fs.existsSync(userDataDir)) {
        launchOpts.userDataDir = userDataDir;
      }
    }

    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      launchOpts.executablePath = process.env.CHROME_PATH;
    }

    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const url = `https://www.tiktok.com/@${username}/live`;
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    console.log('✓ Page loaded');
    await page.waitForTimeout(3000);

    // 检查是否是直播
    const isLive = await page.evaluate(() => {
      return document.body.textContent.includes('LIVE') || 
             document.body.textContent.includes('直播') ||
             !!document.querySelector('[class*="live"]');
    });

    console.log(`Is live: ${isLive}`);

    // 等待 WebRTC 初始化
    console.log('\nWaiting for media initialization...');
    for (let i = 0; i < 16; i++) {
      console.log(`  ${i + 1}..`);
      await page.waitForTimeout(1000);
    }

    // 拍摄多个截图，保存一些
    console.log('\nCapturing screenshots at different stages:');

    const screenshots = [];
    for (let i = 0; i < 3; i++) {
      const buffer = await page.screenshot({ fullPage: false });
      screenshots.push(buffer);
      
      const filename = `debug-screenshot-${i + 1}.png`;
      fs.writeFileSync(filename, buffer);
      console.log(`  ${filename}: ${buffer.length} bytes`);
      
      if (i < 2) {
        await page.waitForTimeout(2000);
      }
    }

    // 分析页面内容
    console.log('\nPage analysis:');
    const analysis = await page.evaluate(() => {
      const bodyText = document.body.textContent;
      return {
        hasLiveText: bodyText.includes('LIVE') || bodyText.includes('直播'),
        pageTitle: document.title,
        viewportSize: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        bodySize: {
          width: document.body.clientWidth,
          height: document.body.clientHeight
        }
      };
    });

    console.log(JSON.stringify(analysis, null, 2));

    // 保存 HTML 用于查看
    const html = await page.content();
    fs.writeFileSync('debug-page.html', html);
    console.log('\n✓ Page saved to debug-page.html');

    console.log('\nGenerated files:');
    console.log('  - debug-screenshot-1.png (first capture)');
    console.log('  - debug-screenshot-2.png (after 2s)');
    console.log('  - debug-screenshot-3.png (after 4s)');
    console.log('  - debug-page.html (full HTML)');
    console.log('\nPlease check if any of these contain actual live stream content.');

    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

debugCapture();
