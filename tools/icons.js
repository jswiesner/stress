#!/usr/bin/env node
/*
 * Renders the app icon and launch splash (src/art.js -> StressArt.icon/splash)
 * to every size the web app, the App Store and the iOS project need, using the
 * bundled Chromium from Playwright.
 *
 *   node tools/icons.js
 *
 * Writes:
 *   assets/icons/*.png                       web app and PWA icons
 *   store/icon-1024.png                      App Store icon (opaque RGB, as Apple requires)
 *   ios/App/App/Assets.xcassets/AppIcon...   light, dark and tinted iOS icons (if ios/ exists)
 *   ios/App/App/Assets.xcassets/Splash...    light and dark launch splash (if ios/ exists)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets/icons');
const STORE = path.join(ROOT, 'store');
const XC = path.join(ROOT, 'ios/App/App/Assets.xcassets');
const SIZES = [
  ['icon-1024.png', 1024, false], ['icon-512.png', 512, false], ['icon-192.png', 192, false],
  ['apple-touch-icon.png', 180, false], ['favicon-32.png', 32, false], ['maskable-512.png', 512, true]
];

const rgb = (from, to) => execFileSync('python3', ['-c',
  `from PIL import Image\nImage.open(${JSON.stringify(from)}).convert('RGB').save(${JSON.stringify(to)})`]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(STORE, { recursive: true });
  const scripts = ['src/rules.js', 'src/art.js'].map(f => '<script>' + fs.readFileSync(path.join(ROOT, f), 'utf8') + '</script>').join('');
  const font = fs.readFileSync(path.join(ROOT, 'assets/fonts/unbounded-latin.woff2')).toString('base64');
  const browser = await chromium.launch();

  async function render(file, size, expr, transparent) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent('<html><head><style>@font-face{font-family:Unbounded;src:url(data:font/woff2;base64,' + font +
      ') format("woff2");font-weight:500 800}html,body{margin:0;background:transparent}</style></head><body><div id="i"></div>' +
      scripts + '<script>document.getElementById("i").innerHTML = ' + expr + ';</script></body></html>');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(50);
    await page.locator('#i svg').screenshot({ path: file, omitBackground: !!transparent });
    await page.close();
    console.log('wrote', path.relative(ROOT, file));
  }

  for (const [name, size, maskable] of SIZES) {
    await render(path.join(OUT, name), size, 'StressArt.icon(' + size + ', { maskable: ' + maskable + ' })');
  }
  rgb(path.join(OUT, 'icon-1024.png'), path.join(STORE, 'icon-1024.png'));
  console.log('wrote store/icon-1024.png (RGB)');

  if (fs.existsSync(XC)) {
    const icons = path.join(XC, 'AppIcon.appiconset');
    for (const f of fs.readdirSync(icons)) if (f.endsWith('.png')) fs.unlinkSync(path.join(icons, f));
    fs.copyFileSync(path.join(STORE, 'icon-1024.png'), path.join(icons, 'AppIcon-1024.png'));
    await render(path.join(icons, 'AppIcon-1024-dark.png'), 1024, 'StressArt.icon(1024, { variant: "dark" })', true);
    await render(path.join(icons, 'AppIcon-1024-tinted.png'), 1024, 'StressArt.icon(1024, { variant: "tinted" })', true);
    const entry = (filename, appearance) => Object.assign({ filename, idiom: 'universal', platform: 'ios', size: '1024x1024' },
      appearance ? { appearances: [{ appearance: 'luminosity', value: appearance }] } : {});
    fs.writeFileSync(path.join(icons, 'Contents.json'), JSON.stringify({
      images: [entry('AppIcon-1024.png'), entry('AppIcon-1024-dark.png', 'dark'), entry('AppIcon-1024-tinted.png', 'tinted')],
      info: { author: 'xcode', version: 1 }
    }, null, 2) + '\n');

    const splash = path.join(XC, 'Splash.imageset');
    for (const f of fs.readdirSync(splash)) if (f.endsWith('.png')) fs.unlinkSync(path.join(splash, f));
    for (const [name, dark] of [['splash-2732.png', false], ['splash-2732-dark.png', true]]) {
      await render(path.join(splash, name), 2732, 'StressArt.splash(2732, ' + dark + ')');
      rgb(path.join(splash, name), path.join(splash, name));
    }
    fs.writeFileSync(path.join(splash, 'Contents.json'), JSON.stringify({
      images: [
        { idiom: 'universal', filename: 'splash-2732.png' },
        { idiom: 'universal', filename: 'splash-2732-dark.png', appearances: [{ appearance: 'luminosity', value: 'dark' }] }
      ],
      info: { author: 'xcode', version: 1 }
    }, null, 2) + '\n');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
