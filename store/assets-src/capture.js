const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCENES = [
  { file: 'scene1.html', out: ['../chrome-web-store/screenshots/01-pin-element.png', '../firefox-amo/screenshots/01-pin-element.png'], w: 1280, h: 800 },
  { file: 'scene2.html', out: ['../chrome-web-store/screenshots/02-markdown-disk.png', '../firefox-amo/screenshots/02-markdown-disk.png'], w: 1280, h: 800 },
  { file: 'scene3.html', out: ['../chrome-web-store/screenshots/03-review-loop.png', '../firefox-amo/screenshots/03-review-loop.png'], w: 1280, h: 800 },
  { file: 'scene4.html', out: ['../chrome-web-store/screenshots/04-notes-panel.png', '../firefox-amo/screenshots/04-notes-panel.png'], w: 1280, h: 800 },
  { file: 'scene5.html', out: ['../chrome-web-store/screenshots/05-zero-config.png', '../firefox-amo/screenshots/05-zero-config.png'], w: 1280, h: 800 },
  { file: 'promo.html', out: ['../promo/promo-440x280.png'], w: 440, h: 280 },
];

(async () => {
  const browser = await chromium.launch();
  for (const scene of SCENES) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: scene.w, height: scene.h });
    const filePath = path.resolve(__dirname, scene.file);
    await page.goto('file://' + filePath);
    await page.waitForTimeout(500);
    for (const out of scene.out) {
      const outPath = path.resolve(__dirname, out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: scene.w, height: scene.h } });
      console.log('Captured:', outPath);
    }
    await page.close();
  }
  await browser.close();
  console.log('Done!');
})();
