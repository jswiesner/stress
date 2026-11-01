#!/usr/bin/env node
/*
 * End-to-end check in a real browser. Serves the site and plays the way a new
 * player would: the tutorial, the first rival (with undo after a loss), the
 * daily puzzle and a pack puzzle (using hints), a quick match that is saved
 * and resumed, a two-player game with the clock, and the menus.
 *
 *   node tools/e2e.js            # needs Playwright with Chromium installed
 *   node tools/e2e.js --shots D  # also save screenshots into folder D
 *
 * Fails on any page error or console error, a game that never ends, or
 * a screen that won't open or overflows sideways.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
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
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) throw new Error('Check failed: ' + msg); };
const visible = (page, sel) => page.isVisible(sel);
const screenIs = (page, name) => page.$eval('#screen-' + name, el => el.classList.contains('active'));

async function shot(page, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, name + '.png') });
}

async function noSideways(page, what) {
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), what + ': no sideways scroll');
}

async function finishTutorial(page) {
  for (let i = 0; i < 60 && !(await screenIs(page, 'results')); i++) {
    if (await visible(page, '#t-next')) { await page.click('#t-next'); await sleep(250); continue; }
    const spot = await page.$$eval('#t-board .cell.spot', els => els.map(e => +e.dataset.sq));
    if (spot.length) { await page.click(`#t-board .cell[data-sq="${spot[0]}"]`); await sleep(900); continue; }
    await sleep(200);
  }
  ok(await screenIs(page, 'results'), 'tutorial ends on the results screen');
}

// Wait until the human may move, or the match is over.
async function waitTurn(page, boardSel, timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await screenIs(page, 'results')) return 'over';
    if (await page.$('#sheet-root .sheet')) return 'sheet';
    if (await page.$(boardSel + '.interactive')) return 'turn';
    await sleep(60);
  }
  throw new Error('Timed out waiting for a turn');
}

async function randomMove(page, side) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const mine = await page.$$eval('#board .cell', (cells, side) => cells.map((c, i) => [i, c.getAttribute('aria-label') || '']).filter(([, l]) => l.includes(', ' + side + ' ')).map(([i]) => i), side);
    ok(mine.length > 0, 'the side to move has pieces');
    await page.click(`#board .cell[data-sq="${mine[Math.floor(Math.random() * mine.length)]}"]`);
    const targets = await page.$$eval('#board .cell.mv, #board .cell.cap', els => els.map(e => +e.dataset.sq));
    if (!targets.length) continue;
    const caps = await page.$$eval('#board .cell.cap', els => els.map(e => +e.dataset.sq));
    await page.click(`#board .cell[data-sq="${caps.length && Math.random() < 0.7 ? caps[0] : targets[Math.floor(Math.random() * targets.length)]}"]`);
    return;
  }
  throw new Error('No legal move found');
}

async function playOut(page, pvp, maxMoves = 160) {
  for (let n = 0; n < maxMoves; n++) {
    const s = await waitTurn(page, '#board');
    if (s === 'over') return n;
    if (s === 'sheet') throw new Error('unexpected sheet during play');
    const side = pvp ? await page.$eval('.side.active', el => (el.dataset.side === 'blue' ? 'Blue' : 'Red')) : 'Blue';
    await randomMove(page, side);
  }
  throw new Error('Game did not finish');
}

async function solveWithHints(page) {
  for (let n = 0; n < 8; n++) {
    const s = await waitTurn(page, '#board');
    if (s === 'over') return true;
    if (s === 'sheet') return false;
    await page.click('#btn-hint');
    await page.waitForSelector('#board .cell.hint-to', { timeout: 15000 });
    const from = await page.$eval('#board .cell.hint-from', e => +e.dataset.sq);
    const to = await page.$eval('#board .cell.hint-to', e => +e.dataset.sq);
    await page.click(`#board .cell[data-sq="${from}"]`);
    await page.click(`#board .cell[data-sq="${to}"]`);
  }
  return screenIs(page, 'results');
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const problems = [];
  try {
    for (const run of [
      { name: 'phone', viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'no-preference' },
      { name: 'small-dark', viewport: { width: 360, height: 700 }, colorScheme: 'dark', reducedMotion: 'reduce' },
      { name: 'tablet', viewport: { width: 1024, height: 1180 }, colorScheme: 'light', reducedMotion: 'reduce' }
    ]) {
      const ctx = await browser.newContext({ viewport: run.viewport, colorScheme: run.colorScheme, reducedMotion: run.reducedMotion, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      page.on('pageerror', e => problems.push(run.name + ' pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error') problems.push(run.name + ' console: ' + m.text()); });
      await page.goto(base, { waitUntil: 'load' });

      // 1. first launch opens the tutorial
      ok(await screenIs(page, 'tutorial'), run.name + ': first launch starts the tutorial');
      await shot(page, run.name + '-tutorial');
      await finishTutorial(page);
      ok(/ready/i.test(await page.textContent('.res-title')), 'tutorial result title');
      await shot(page, run.name + '-tutorial-done');

      // 2. the first rival, straight from the tutorial
      await page.click('[data-res="next-rival"]');
      ok(await screenIs(page, 'game'), 'rival game starts');
      await noSideways(page, run.name + ' game');
      const box = await page.$eval('#board', el => { const r = el.getBoundingClientRect(); return { w: r.width, bottom: r.bottom, right: r.right }; });
      ok(box.w > 200 && box.bottom <= run.viewport.height + 1 && box.right <= run.viewport.width + 1, run.name + ': board fits the screen');
      await waitTurn(page, '#board');
      await shot(page, run.name + '-game');
      await playOut(page, false);
      const title = await page.textContent('.res-title');
      ok(/Victory|wins/.test(title), 'rival result: ' + title);
      await shot(page, run.name + '-result');
      if (await visible(page, '[data-res="undo"]')) {
        await page.click('[data-res="undo"]');
        ok(await screenIs(page, 'game'), 'undo returns to the game');
        await playOut(page, false);
      }
      await page.click('[data-res="home"]');
      ok(await screenIs(page, 'home'), 'home');
      await noSideways(page, run.name + ' home');
      await shot(page, run.name + '-home');

      // 3. daily puzzle, solved with hints, then shareable
      await page.click('#h-daily');
      ok(await screenIs(page, 'game'), 'daily puzzle opens');
      ok(await solveWithHints(page), 'daily puzzle solved with hints');
      ok(/Daily solved/.test(await page.textContent('.res-title')), 'daily result');
      ok(await visible(page, '[data-res="share"]'), 'daily result can be shared');
      // More puzzles goes straight to the next unsolved pack puzzle.
      await page.click('[data-res="more-puzzles"]');
      ok(await screenIs(page, 'game'), 'More puzzles opens a puzzle');
      ok(/Puzzle Warm-up/.test(await page.textContent('#g-title')), 'the next puzzle is from the first pack');
      await page.click('#g-menu');
      await page.click('[data-act="quit"]');
      ok(await screenIs(page, 'puzzles'), 'quitting it lands on the puzzles screen');
      await page.click('[data-back]:visible');
      ok(/Done/.test(await page.textContent('#h-daily')), 'home shows the daily as done');

      // 4. a pack puzzle, then the next one
      await page.click('#h-puzzles');
      await page.click('[data-pack="warmup"]');
      await page.click('[data-pz="w01"]');
      ok(await solveWithHints(page), 'warm-up puzzle 1 solved');
      await page.click('[data-res="next-puzzle"]');
      ok(await screenIs(page, 'game'), 'next puzzle opens');
      // A miss, then a retry: the attempt counter shows.
      let missed = false;
      for (let i = 0; i < 4 && !missed; i++) {
        const st = await waitTurn(page, '#board');
        if (st === 'sheet') { missed = true; break; }
        if (st === 'over') break;
        await randomMove(page, 'Blue');
        missed = (await waitTurn(page, '#board')) === 'sheet';
      }
      if (missed) {
        await page.click('[data-act="retry"]');
        ok(/Try 2/.test(await page.textContent('#g-sub')), 'the retry is counted as try 2');
      }
      if (!(await screenIs(page, 'results'))) { await page.click('#g-menu'); await page.click('[data-act="quit"]'); }
      else await page.click('[data-res="puzzles"]');
      ok(await screenIs(page, 'puzzles'), 'quitting a puzzle returns to puzzles');
      // The hard packs: open Expert (seed the five solves per pack it needs) and solve one.
      await page.evaluate(() => {
        const app = StressApp;
        for (const pack of StressPuzzles.packs.slice(0, 3)) pack.puzzles.slice(0, 5).forEach(z => { app.profile.puzzles[z.id] = { solved: true, hinted: true, tries: 1, clean: false }; });
        app.saveProfile();
        StressScreens.puzzles();
      });
      ok(!!(await page.$('[data-pack="expert"]')), 'Expert opens after five solves in each earlier pack');
      ok(!(await page.$('[data-pack="grandmaster"]')), 'Grandmaster stays locked until five Expert solves');
      await page.click('[data-pack="expert"]');
      const first = await page.$eval('[data-pack="expert"]', b => b.closest('.pack').querySelector('[data-pz]').dataset.pz);
      await page.click(`[data-pz="${first}"]`);
      ok(/Expert/.test(await page.textContent('#g-title')), 'an Expert puzzle opens');
      ok(/Win in 4/.test(await page.textContent('#g-sub')), 'it is a win in 4');
      // Only one first move wins, so a wrong one fails at once, with no search.
      await waitTurn(page, '#board');
      const tw = Date.now();
      await randomMove(page, 'Blue');
      if ((await waitTurn(page, '#board')) === 'sheet') {
        ok(Date.now() - tw < 8000, 'a wrong first move on a deep puzzle is caught quickly, with Red\'s answer shown (' + (Date.now() - tw) + ' ms)');
        await page.click('[data-act="retry"]');
        ok(/Try 2/.test(await page.textContent('#g-sub')), 'the retry is try 2');
      } else {
        await page.click('#g-menu');
        await page.click('[data-act="restart"]');
      }
      const t0 = Date.now();
      ok(await solveWithHints(page), 'the Expert puzzle is solved by following its hints');
      ok(Date.now() - t0 < 30000, 'deep puzzles answer quickly (' + (Date.now() - t0) + ' ms)');
      await page.click('[data-res="puzzles"]');
      // A tempting miss shows Red's answer: in Mastery m25, taking the Jumper on c5 looks
      // like a two-move win, but Red's Runner recaptures.
      await page.evaluate(() => StressApp.startPuzzleById('m25'));
      await waitTurn(page, '#board');
      await page.click('#board .cell[data-sq="22"]');
      await page.click('#board .cell[data-sq="16"]');
      ok((await waitTurn(page, '#board')) === 'sheet', 'the tempting miss in m25 fails');
      ok(/Runner takes your Runner on c5/.test(await page.textContent('#miss-why')), 'the miss names Red\'s answer');
      ok(await page.evaluate(() => StressMatch.current.state.owner[StressRules.squareIndex('c5')] === StressRules.RED), 'Red\'s answer is on the board');
      await page.click('[data-act="quit"]');
      await page.click('[data-back]:visible');

      // 5. quick match: save, quit, resume, finish
      await page.click('#h-quick');
      await waitTurn(page, '#board');
      await randomMove(page, 'Blue');
      await waitTurn(page, '#board');
      await page.click('#g-menu');
      await page.click('[data-act="quit"]');
      ok(await screenIs(page, 'home'), 'save and quit goes home');
      await page.click('#h-quick');
      ok((await waitTurn(page, '#board')) === 'turn', 'quick match resumes');
      await playOut(page, false);
      await page.click('[data-res="home"]');

      // 6. two players with the clock
      await page.click('#h-settings');
      await page.click('[data-seg="clock"][data-v="180"]');
      await page.click('[data-back]:visible');
      await page.click('#h-pvp');
      ok(await visible(page, '#clock-0'), 'two-player clock shows');
      await playOut(page, true);
      ok(/wins|draw/i.test(await page.textContent('.res-title')), 'pvp result');
      await page.click('[data-res="home"]');

      // 7. menus
      await page.click('#h-rivals');
      ok(await page.$$eval('.rival-row', r => r.length) === 10, 'ten rivals');
      await shot(page, run.name + '-rivals');
      await page.click('[data-back]:visible');
      await page.click('#h-profile');
      for (const t of ['themes', 'awards', 'stats']) { await page.click(`[data-tab="${t}"]`); ok(await page.$('#collection-body > *'), t + ' tab renders'); }
      await shot(page, run.name + '-collection');
      await page.click('[data-back]:visible');
      await page.click('#h-settings');
      await page.click('[data-seg="appearance"][data-v="dark"]');
      ok(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'dark appearance applies');
      await page.click('[data-seg="appearance"][data-v="auto"]');
      await page.click('[data-do="rules"]');
      ok(await page.$$eval('#rules-body .piece-card .piece', els => els.length) >= 4, 'rules show the pieces');
      await page.click('[data-back]:visible');
      await page.click('[data-back]:visible');
      ok(await screenIs(page, 'home'), 'back to home');
      console.log(`${run.name}: tutorial, rival, daily, puzzles, quick (save/resume), two-player and menus OK`);
      await ctx.close();
    }

    // Layouts across real device sizes: nothing overflows, the board fits, the top bar
    // stays on top, tablets get a big board, landscape tablets put the board beside the players.
    for (const [name, width, height] of [
      ['iPhone SE', 375, 667], ['iPhone 16 Pro Max', 440, 956], ['iPad split view', 507, 1032],
      ['iPad mini', 744, 1133], ['iPad mini landscape', 1133, 744], ['iPad 13"', 1032, 1376], ['iPad 13" landscape', 1376, 1032]
    ]) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { if (!localStorage.getItem('stress3.profile')) localStorage.setItem('stress3.profile', JSON.stringify({ v: 3, tutorialDone: true })); });
      const page = await ctx.newPage();
      page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message));
      await page.goto(base, { waitUntil: 'load' });
      ok(await screenIs(page, 'home'), name + ': home');
      await noSideways(page, name + ' home');
      const tiles = await page.$eval('#h-pvp', el => el.getBoundingClientRect().bottom);
      ok(tiles <= height + 1, name + ': the whole home screen fits (' + Math.round(tiles) + ' of ' + height + ')');
      await page.click('#h-quick');
      await waitTurn(page, '#board');
      await noSideways(page, name + ' game');
      const g = await page.evaluate(() => {
        const r = id => document.querySelector(id).getBoundingClientRect();
        return { board: r('#board'), top: r('#screen-game .g-top'), bar: r('#screen-game .g-bar'), me: r('#side-me') };
      });
      ok(g.board.bottom <= height + 1 && g.board.right <= width + 1 && g.bar.bottom <= height + 1, name + ': board and controls fit');
      if (height > width) ok(g.top.top < 40, name + ': the top bar is at the top');
      if (Math.min(width, height) >= 700) ok(g.board.width >= 600, name + ': tablets get a big board (' + Math.round(g.board.width) + 'px)');
      if (width > height && width >= 900) ok(g.board.right <= g.me.left, name + ': landscape puts the board beside the players');
      await shot(page, 'layout-' + name.replace(/\W+/g, '-'));
      await ctx.close();
    }
    console.log('layouts: iPhone SE to iPad 13" landscape fit without overflow');

    // Opened as a file: no worker, no service worker. The computer still plays.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const fileErr = [];
    page.on('pageerror', e => fileErr.push(e.message));
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.click('#t-skip');
    await page.click('#h-quick');
    await playOut(page, false);
    ok(fileErr.length === 0, 'no errors from file:// ' + fileErr.join('; '));
    console.log('file:// fallback: a full quick match works without workers');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  if (problems.length) { console.error('Problems:\n' + problems.join('\n')); process.exit(1); }
  console.log(`All ${checks} browser checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
