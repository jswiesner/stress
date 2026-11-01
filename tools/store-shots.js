#!/usr/bin/env node
/*
 * App Store screenshots. Drives the real app in Chromium, sets up six scenes
 * (a duel, the rivals ladder, the daily puzzle, the tutorial, a results screen
 * and dark mode), captures each at the device's real size and frames it with
 * a caption.
 *
 *   node tools/store-shots.js                  # every device
 *   node tools/store-shots.js --device iphone  # just one
 *   node tools/store-shots.js --raw DIR        # also keep the unframed captures
 *
 * Writes store/screenshots/<device>/NN-name.jpg at the exact pixel sizes App
 * Store Connect accepts: iPhone 6.9" (1320 x 2868) and iPad 13" (2048 x 2732).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const R = require('../src/rules.js');
const P = require('../src/progress.js');
const DATA = require('../src/data/puzzles.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store/screenshots');
const arg = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const only = arg('--device');
const rawDir = arg('--raw');

const DEVICES = [
  // viewport = the device in points; the capture is viewport x scale pixels.
  // insets = the status bar and home indicator areas the app keeps clear on that device.
  { id: 'iphone-6.9', canvas: [1320, 2868], viewport: [440, 956], scale: 3, insets: [62, 34], island: true, frame: { top: 560, width: 980, bezel: 18, radius: 112 }, type: { caption: 100, sub: 50, top: 150, width: 1160 } },
  { id: 'ipad-13', canvas: [2048, 2732], viewport: [1032, 1376], scale: 2, insets: [24, 20], island: false, frame: { top: 520, width: 1560, bezel: 22, radius: 72 }, type: { caption: 108, sub: 56, top: 130, width: 1820 } }
];

// ---------------------------------------------------------------- saved states
const today = P.dayKey(new Date());
const yesterday = P.dayKey(new Date(Date.now() - 864e5));

function veteran(extraStars) {
  const p = P.newProfile();
  p.tutorialDone = true;
  p.xp = P.xpForLevel(8) - 120;
  const stars = Object.assign({ pip: 3, bramble: 3, marlow: 2, juniper: 3, ozzie: 2, wren: 1 }, extraStars || {});
  for (const [id, s] of Object.entries(stars)) p.rivals[id] = { stars: s, wins: 2, plays: 3 };
  DATA.packs[0].puzzles.slice(0, 31).concat(DATA.packs[1].puzzles.slice(0, 9)).forEach(z => { p.puzzles[z.id] = { solved: true, hinted: false }; });
  p.daily = { last: yesterday, streak: 12, best: 12, done: { [yesterday]: { moves: 2, hinted: false } } };
  p.stats = { games: 41, wins: 27, crowns: 6, cracks: 19, raids: 233, pvp: 3, tutorials: 1, quickLevel: 5 };
  for (const id of ['tutorial', 'raid', 'win', 'crown', 'crack', 'triple', 'halfway', 'puzzler', 'habit', 'friends']) p.achievements[id] = yesterday;
  return p;
}

function position(rows, stress, hits, ply, lastMove) {
  const named = {};
  for (const [i, h] of Object.entries(hits)) named[R.squareName(+i)] = h;
  const st = R.fromRows(rows, { stress, hits: named, ply });
  st.lastMove = lastMove;
  return R.serialize(st);
}

// Two real mid-game positions from computer self-play (tools/sim), Blue to move.
const DUEL = position(['gj..g..', '..c.JJ.', 'r......', '..j....', '....r..', '.......', 'G.RCR.G'], [2, 7], { 11: 1, 12: 2, 32: 1 }, 18, (6 << 6) | 4);
const NIGHT = position(['gjrcr..', '.......', '.J.J..g', '.......', '.......', '.......', 'G.RCR.j'], [2, 5], { 15: 2, 17: 1, 48: 2 }, 12, (33 << 6) | 48);
const game = (state, opponent) => ({ mode: 'rival', state, history: [], clocks: null, stats: { peak: [state.stress[0], state.stress[1]], maxRaid: 2, myMoves: 9 }, opponent });

const QUIET = { sound: false, music: false, haptics: true, hints: true, appearance: 'light', clock: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SCENES = [
  {
    id: '01-duel', caption: 'Stress them out.', sub: 'A three-minute duel of nerve', bg: ['#D4F2E6', '#9EDCC5'],
    store: { profile: veteran(), game: game(DUEL, { id: 'calloway', level: 7 }) },
    async setup(page) {
      await page.evaluate(() => StressApp.resumeGame());
      await sleep(700);
      await page.click('#board .cell[data-sq="11"]');
      await page.evaluate(() => { const el = document.getElementById('opp-say'); el.textContent = 'Man overboard!'; el.hidden = false; });
    }
  },
  {
    id: '02-rivals', caption: 'Ten rivals. Thirty stars.', sub: 'Every one plays their own way', bg: ['#FFE8D6', '#FFC4A3'],
    store: { profile: veteran() },
    async setup(page) { await page.evaluate(() => StressApp.show('rivals')); }
  },
  {
    id: '03-daily', caption: 'A fresh puzzle every day', sub: 'Keep your streak alive', bg: ['#FFF2C9', '#FFD47F'],
    store: { profile: veteran() },
    async setup(page) {
      await page.evaluate(() => StressApp.startDaily());
      await sleep(600);
      await page.click('#btn-hint');
    }
  },
  {
    id: '04-learn', caption: 'Learn it in a minute', sub: 'Then master it for months', bg: ['#DDEBFF', '#AACBFF'],
    store: { profile: null },
    async setup() { await sleep(600); }
  },
  {
    id: '05-rewards', caption: 'Win stars. Unlock boards.', sub: 'From Rattled to Zen Master', bg: ['#EEE6FF', '#CBB9FF'],
    store: { profile: veteran() },
    async setup(page) {
      await page.evaluate(() => {
        const r = StressRivals.byId('calloway');
        StressApp.current = { mode: 'rival', rival: r };
        StressApp.onMatchFinish({
          mode: 'rival', won: true, winner: StressRules.BLUE, reason: 'stress', myStress: 2, theirStress: 10, peakStress: 3,
          myMoves: 17, raids: 10, maxRaid: 2, captures: [2, 1], plies: 34, rivalId: 'calloway', level: 7
        }, StressApp.current);
      });
      await sleep(3200);
    }
  },
  {
    id: '06-calm', caption: 'Calm by design', sub: 'No ads. No pressure. Plays offline.', bg: ['#26375A', '#0F1729'], dark: true,
    store: { profile: Object.assign(veteran({ calloway: 2 }), { theme: 'midnight' }), game: game(NIGHT, { id: 'nova', level: 9 }), settings: Object.assign({}, QUIET, { appearance: 'dark' }) },
    async setup(page) { await page.evaluate(() => StressApp.resumeGame()); await sleep(700); }
  }
];

// The browser has no safe areas, so keep the device's status bar and home indicator
// areas clear the way the app does on a phone, and draw a plain status bar there.
async function deviceChrome(page, device, scene) {
  const [top, bottom] = device.insets, ink = scene.dark ? '#F4F7FB' : '#13201B';
  await page.addStyleTag({ content: `html{padding-top:${top}px!important;padding-bottom:${bottom}px!important}` +
    `#fake-status{position:fixed;left:0;right:0;top:0;height:${top}px;z-index:9999;pointer-events:none;display:flex;align-items:center;justify-content:space-between;` +
    `padding:${device.island ? '6px 34px 0 46px' : '0 26px'};font:600 ${device.island ? 17 : 14}px/1 -apple-system,'Figtree',sans-serif;color:${ink}}` +
    `#fake-status .pill{position:absolute;left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000}` +
    `#fake-status svg{display:block}` });
  await page.evaluate(([island, ink]) => {
    const bar = document.createElement('div');
    bar.id = 'fake-status';
    bar.setAttribute('aria-hidden', 'true');
    const signal = '<svg width="18" height="12" viewBox="0 0 18 12">' + [0, 1, 2, 3].map(i => `<rect x="${i * 5}" y="${8 - i * 2.6}" width="3.2" height="${4 + i * 2.6}" rx="1" fill="${ink}"/>`).join('') + '</svg>';
    const wifi = `<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 11.5l2.4-2.9a3.6 3.6 0 00-4.8 0zM3.6 6.4a7.2 7.2 0 019.8 0l1.6-1.9a9.8 9.8 0 00-13 0zM.6 2.9a11.9 11.9 0 0115.8 0" fill="none" stroke="${ink}" stroke-width="1.9" stroke-linecap="round"/></svg>`;
    const battery = `<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".6" y=".6" width="22.8" height="11.8" rx="3.6" fill="none" stroke="${ink}" stroke-opacity=".4" stroke-width="1.2"/><rect x="2.4" y="2.4" width="19.2" height="8.2" rx="2.2" fill="${ink}"/><path d="M25 4.4v4.2a2.2 2.2 0 000-4.2z" fill="${ink}" fill-opacity=".45"/></svg>`;
    bar.innerHTML = '<span>9:41</span>' + (island ? '<span class="pill"></span>' : '') + `<span style="display:flex;gap:6px;align-items:center">${signal}${wifi}${battery}</span>`;
    document.body.appendChild(bar);
  }, [device.island, ink]);
}

// ---------------------------------------------------------------- serving and framing
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const font = f => fs.readFileSync(path.join(ROOT, 'assets/fonts', f)).toString('base64');
const FONTS = `@font-face{font-family:Unbounded;src:url(data:font/woff2;base64,${font('unbounded-latin.woff2')}) format("woff2");font-weight:500 800}` +
  `@font-face{font-family:Figtree;src:url(data:font/woff2;base64,${font('figtree-latin.woff2')}) format("woff2");font-weight:400 800}`;

function frameHtml(device, scene, png) {
  const [W, H] = device.canvas, f = device.frame, t = device.type;
  const ink = scene.dark ? '#F2F6FF' : '#13201B', sub = scene.dark ? 'rgba(235,242,255,.78)' : 'rgba(19,32,27,.72)';
  return `<html><head><style>${FONTS}
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
    body{background:linear-gradient(180deg,${scene.bg[0]},${scene.bg[1]});font-family:Figtree,sans-serif;position:relative}
    .glow{position:absolute;left:50%;top:${f.top + 260}px;width:${W * 1.1}px;height:${W * 1.1}px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,${scene.dark ? '.10' : '.45'}),rgba(255,255,255,0))}
    .copy{position:absolute;left:0;right:0;top:${t.top}px;margin:0 auto;width:${t.width}px;text-align:center}
    h1{margin:0;font-family:Unbounded,sans-serif;font-weight:800;font-size:${t.caption}px;line-height:1.08;letter-spacing:-.01em;color:${ink};text-wrap:balance}
    p{margin:${Math.round(t.sub * .55)}px 0 0;font-weight:700;font-size:${t.sub}px;line-height:1.2;color:${sub}}
    .device{position:absolute;left:50%;top:${f.top}px;width:${f.width}px;transform:translateX(-50%);padding:${f.bezel}px;border-radius:${f.radius}px;background:#0D1411;
      box-shadow:0 ${f.bezel * 3}px ${f.bezel * 7}px rgba(10,20,30,.28),0 ${f.bezel}px ${f.bezel * 2}px rgba(10,20,30,.18),inset 0 0 0 3px rgba(255,255,255,.10)}
    .device img{display:block;width:100%;border-radius:${f.radius - f.bezel}px}
  </style></head><body><div class="glow"></div><div class="copy"><h1>${scene.caption}</h1><p>${scene.sub}</p></div>
  <div class="device"><img src="data:image/png;base64,${png.toString('base64')}"></div></body></html>`;
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const errors = [];
  for (const device of DEVICES.filter(d => !only || d.id.startsWith(only))) {
    const dir = path.join(OUT, device.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const scene of SCENES) {
      const ctx = await browser.newContext({
        viewport: { width: device.viewport[0], height: device.viewport[1] }, deviceScaleFactor: device.scale,
        colorScheme: scene.dark ? 'dark' : 'light', reducedMotion: 'reduce', hasTouch: true, isMobile: device.id.startsWith('iphone')
      });
      const data = {
        'stress3.settings': JSON.stringify(scene.store.settings || QUIET),
        'stress3.profile': scene.store.profile ? JSON.stringify(scene.store.profile) : null,
        'stress3.game': scene.store.game ? JSON.stringify(scene.store.game) : null
      };
      await ctx.addInitScript(d => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        for (const [k, v] of Object.entries(d)) if (v !== null) localStorage.setItem(k, v);
      }, data);
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(scene.id + ': ' + e.message));
      await page.goto(base);
      await deviceChrome(page, device, scene);
      await page.evaluate(() => document.fonts.ready);
      await sleep(500);
      await scene.setup(page);
      await sleep(400);
      await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
      const png = await page.screenshot({ type: 'png' });
      if (rawDir) { fs.mkdirSync(path.join(rawDir, device.id), { recursive: true }); fs.writeFileSync(path.join(rawDir, device.id, scene.id + '.png'), png); }
      await ctx.close();

      const framer = await browser.newPage({ viewport: { width: device.canvas[0], height: device.canvas[1] }, deviceScaleFactor: 1 });
      await framer.setContent(frameHtml(device, scene, png));
      await framer.evaluate(() => document.fonts.ready);
      await framer.screenshot({ path: path.join(dir, scene.id + '.jpg'), type: 'jpeg', quality: 90 });
      await framer.close();
      console.log('wrote', path.relative(ROOT, path.join(dir, scene.id + '.jpg')));
    }
  }
  await browser.close();
  server.close();
  if (errors.length) { console.error('Page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
