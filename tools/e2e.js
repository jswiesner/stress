#!/usr/bin/env node
/*
 * End-to-end check in a real browser: serves the site, then plays whole games
 * through the interface by tapping squares, like a person would.
 *
 *   node tools/e2e.js            # needs Playwright with Chromium installed
 *   node tools/e2e.js --shots D  # also save screenshots into folder D
 *
 * Fails on any console error, a game that never ends, or a screen that won't open.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
let checks = 0;
function ok(cond, msg) { checks++; if (!cond) throw new Error('Check failed: ' + msg); }

// Wait until it's a human's turn (board takes taps) or the game is over.
async function waitForTurn(page, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(() => ({
      over: !document.getElementById('gameover').hidden,
      ready: !!document.querySelector('#board.interactive')
    }));
    if (s.over) return 'over';
    if (s.ready) return 'turn';
    await sleep(60);
  }
  throw new Error('Timed out waiting for a turn');
}

// Tap a random piece of the side to move, then one of its marked squares.
async function playRandomMove(page, side) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const pieces = await page.$$eval('#board .cell', (cells, side) => cells
      .map((c, i) => ({ i, label: c.getAttribute('aria-label') || '' }))
      .filter(x => x.label.includes(', ' + side + ' '))
      .map(x => x.i), side);
    ok(pieces.length > 0, 'side to move has pieces');
    const pick = pieces[Math.floor(Math.random() * pieces.length)];
    await page.click(`#board .cell[data-sq="${pick}"]`);
    const targets = await page.$$eval('#board .cell.mv, #board .cell.cap', els => els.map(e => +e.dataset.sq));
    if (!targets.length) continue;
    const caps = await page.$$eval('#board .cell.cap', els => els.map(e => +e.dataset.sq));
    const to = caps.length && Math.random() < 0.7 ? caps[0] : targets[Math.floor(Math.random() * targets.length)];
    await page.click(`#board .cell[data-sq="${to}"]`);
    return;
  }
  throw new Error('Could not find a piece with a legal move');
}

async function playToEnd(page, mode, maxMoves = 160) {
  for (let n = 0; n < maxMoves; n++) {
    const s = await waitForTurn(page);
    if (s === 'over') return n;
    const side = mode === 'ai' ? 'Blue' : await page.$eval('.player.active', el => (el.dataset.side === 'blue' ? 'Blue' : 'Red'));
    await playRandomMove(page, side);
  }
  throw new Error('Game did not finish');
}

async function shot(page, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, name + '.png') });
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  try {
    for (const run of [
      { name: 'phone-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'no-preference' },
      { name: 'phone-dark', viewport: { width: 360, height: 740 }, colorScheme: 'dark', reducedMotion: 'reduce' },
      { name: 'desktop', viewport: { width: 1280, height: 860 }, colorScheme: 'light', reducedMotion: 'reduce' }
    ]) {
      const ctx = await browser.newContext({ viewport: run.viewport, colorScheme: run.colorScheme, reducedMotion: run.reducedMotion, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error') errors.push(run.name + ': ' + m.text()); });
      page.on('pageerror', e => errors.push(run.name + ': ' + e.message));
      await page.goto(base, { waitUntil: 'load' });
      ok(await page.isVisible('#screen-menu'), 'menu shows');
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), run.name + ': no sideways scroll on the menu');
      await shot(page, run.name + '-menu');

      // A full game against the computer, undo from the game-over screen, then a rematch.
      await page.click('#btn-ai');
      ok(await page.isVisible('#screen-game'), 'game screen shows');
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), run.name + ': no sideways scroll in game');
      const fits = await page.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return b.width > 200 && b.bottom <= window.innerHeight; });
      ok(fits, run.name + ': board is a sensible size and fully on screen');
      await waitForTurn(page);
      await playRandomMove(page, 'Blue');
      await waitForTurn(page);
      await shot(page, run.name + '-game');
      const moves = await playToEnd(page, 'ai');
      ok(await page.isVisible('#gameover'), 'game over sheet shows');
      const title = await page.textContent('#go-title');
      ok(/win/i.test(title), 'game over title names a winner: ' + title);
      await sleep(500);
      await shot(page, run.name + '-gameover');
      console.log(`${run.name}: game vs computer finished after ${moves} of your moves: "${title}" (${await page.textContent('#go-reason')})`);
      if (await page.isVisible('#go-undo')) {
        await page.click('#go-undo');
        ok(await page.isHidden('#gameover'), 'undo closes the game over sheet');
        ok((await waitForTurn(page)) === 'turn', 'after undo it is your turn again');
      }
      // leave mid-game, then continue from the menu
      await page.click('#btn-back');
      ok(await page.isVisible('#btn-continue'), 'menu offers to continue the game');
      await page.click('#btn-continue');
      ok((await waitForTurn(page)) === 'turn', 'continued game resumes on your turn');
      await playToEnd(page, 'ai');
      await page.click('#go-again');
      ok(await page.isHidden('#gameover'), 'play again starts a new game');
      await page.click('#btn-back');

      // How to play, settings
      await page.click('#btn-rules');
      ok(await page.isVisible('#screen-rules'), 'rules screen shows');
      ok(await page.$$eval('.diagram-slot .piece', els => els.length) >= 8, 'piece diagrams drawn');
      await shot(page, run.name + '-rules');
      await page.click('#rules-back');
      await page.click('#btn-settings');
      ok(await page.isVisible('#screen-settings'), 'settings screen shows');
      await page.click('#set-theme button[data-v="dark"]');
      ok(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'theme switch works');
      await shot(page, run.name + '-settings');
      await page.click('#set-theme button[data-v="auto"]');
      await page.click('#set-clock button[data-v="180"]');
      await page.click('#settings-back');

      // A two-player game with the clock on.
      await page.click('#btn-pvp');
      ok(await page.isVisible('#clock-0'), 'two-player clock shows');
      const pvpMoves = await playToEnd(page, 'pvp');
      console.log(`${run.name}: two-player game finished after ${pvpMoves} moves: "${await page.textContent('#go-title')}"`);
      await page.click('#go-menu');
      ok(await page.isVisible('#screen-menu'), 'back on the menu');
      await ctx.close();
    }

    // Opened as a local file, workers are blocked: the computer must still play (on the page).
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const fileErrors = [];
    page.on('pageerror', e => fileErrors.push(e.message));
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.click('#btn-ai');
    await playToEnd(page, 'ai');
    ok(fileErrors.length === 0, 'no errors when opened as a file: ' + fileErrors.join('; '));
    console.log('file:// fallback: a full game against the computer works without a worker');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) {
    console.error('Console errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`All ${checks} browser checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
