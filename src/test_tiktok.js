require('dotenv').config();
const fs = require('fs');
const { checkLiveAndCapture } = require('./tiktok_improved');

(async () => {
  const username = process.argv[2] || '@yanyangtian.net';
  console.log('Testing username:', username);
  try {
    const res = await checkLiveAndCapture(username, 3);
    console.log('Detection result:', res);

    if (res && res.live && res.buffer) {
      const clean = username.replace(/[^a-z0-9]/gi, '_');
      const out = `./screenshot_${clean}.png`;
      fs.writeFileSync(out, res.buffer);
      console.log('Saved screenshot to', out);
    }
  } catch (err) {
    console.error('Error during test:', err);
  }
  process.exit(0);
})();