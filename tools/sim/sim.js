#!/usr/bin/env node
/*
 * Stress 2.0 simulator: plays computer-vs-computer games with the real rules
 * (src/rules.js) and the real opponent (src/ai.js), and reports the numbers we
 * tune the design with.
 *
 *   node tools/sim/sim.js --blue 6 --red 6 --games 400
 *   node tools/sim/sim.js --preset ladder        # every level against level 6
 *   node tools/sim/sim.js --preset all           # the full calibration report
 *
 * Players: a level 1-9, "greedy" (random moves, but grabs captures, a beginner
 * stand-in) or "random". Colors alternate who moves first. Level 9 searches
 * exactly its minimum depth here so results don't depend on machine speed;
 * pass --budget 600 to give it the thinking time it gets in the game.
 */
'use strict';
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const R = require(path.join(__dirname, '../../src/rules.js'));
const AI = require(path.join(__dirname, '../../src/ai.js'));

let BUDGET = 0; // ms per move for level 9 (0 = its minimum depth only)

function pickMove(st, player, rng) {
  if (player === 'random' || player === 'greedy') {
    const ms = R.moves(st);
    if (player === 'greedy') {
      const caps = ms.filter(m => st.owner[R.moveTo(m)] !== -1);
      const crown = caps.find(m => st.type[R.moveTo(m)] === R.CROWN);
      if (crown !== undefined) return crown;
      if (caps.length && rng() < 0.8) return caps[Math.floor(rng() * caps.length)];
    }
    return ms[Math.floor(rng() * ms.length)];
  }
  return AI.chooseMove(st, { level: player, rng, budgetMs: player === 9 ? BUDGET : 0 }).move;
}

function playGame(blue, red, seed) {
  const rng = AI.makeRng(seed);
  let st = R.newGame({ first: seed % 2 });
  const share = [{}, {}];
  let leadChanges = 0, lastLead = 0;
  while (st.winner === -1) {
    const res = R.apply(st, pickMove(st, st.turn === R.BLUE ? blue : red, rng));
    st = res.state;
    for (const e of res.events) if (e.type === 'raid') share[e.player][R.PIECE_NAMES[e.piece]] = (share[e.player][R.PIECE_NAMES[e.piece]] || 0) + 1;
    const lead = Math.sign(st.stress[R.RED] - st.stress[R.BLUE]);
    if (lead && lastLead && lead !== lastLead) leadChanges++;
    if (lead) lastLead = lead;
  }
  return {
    winner: st.winner, reason: st.reason, plies: st.ply, first: st.first,
    captures: st.captures[0] + st.captures[1], cracks: st.cracks[0] + st.cracks[1],
    winnerStress: st.winner < 2 ? st.stress[st.winner] : 0, leadChanges,
    share: st.winner < 2 ? share[st.winner] : {}
  };
}

function runBatch(blue, red, games, seed0, threads) {
  if (threads <= 1) {
    const out = [];
    for (let i = 0; i < games; i++) out.push(playGame(blue, red, seed0 + i));
    return Promise.resolve(out);
  }
  const per = Math.ceil(games / threads), jobs = [];
  for (let t = 0; t < threads; t++) {
    const n = Math.min(per, games - t * per);
    if (n <= 0) break;
    jobs.push(new Promise((resolve, reject) => {
      const w = new Worker(__filename, { workerData: { blue, red, games: n, seed0: seed0 + t * per, budget: BUDGET } });
      w.on('message', resolve);
      w.on('error', reject);
    }));
  }
  return Promise.all(jobs).then(parts => parts.flat());
}

function summarize(label, games) {
  const n = games.length, pct = k => Math.round(100 * k / n);
  const count = f => games.filter(f).length;
  const plies = games.map(g => g.plies).sort((a, b) => a - b);
  const reasons = {};
  games.forEach(g => { reasons[g.reason] = (reasons[g.reason] || 0) + 1; });
  const share = {};
  let shareTotal = 0;
  games.forEach(g => { for (const k in g.share) { share[k] = (share[k] || 0) + g.share[k]; shareTotal += g.share[k]; } });
  const avg = f => +(games.reduce((s, g) => s + f(g), 0) / n).toFixed(2);
  return {
    label, games: n,
    blueWins: pct(count(g => g.winner === R.BLUE)), redWins: pct(count(g => g.winner === R.RED)), draws: pct(count(g => g.winner === R.DRAW)),
    firstMoverWins: pct(count(g => g.winner === g.first)),
    reachedRoundLimit: pct(count(g => ['limit', 'sudden-death', 'pieces', 'draw'].includes(g.reason))),
    reasons, medianPlies: plies[n >> 1], p10Plies: plies[Math.floor(n * 0.1)], p90Plies: plies[Math.floor(n * 0.9)],
    capturesPerGame: avg(g => g.captures), cracksPerGame: avg(g => g.cracks), leadChanges: avg(g => g.leadChanges),
    closeGames: pct(count(g => g.winner < 2 && g.winnerStress >= 6)),
    winnerStressShare: Object.fromEntries(Object.entries(share).map(([k, v]) => [k, Math.round(100 * v / Math.max(1, shareTotal)) + '%']))
  };
}

async function matchup(a, b, games, seed, threads) {
  // Half the games with each color, so "a" is scored from both sides.
  const half = Math.floor(games / 2);
  const g1 = await runBatch(a, b, half, seed, threads);
  const g2 = await runBatch(b, a, games - half, seed + 100000, threads);
  const wins = g1.filter(g => g.winner === R.BLUE).length + g2.filter(g => g.winner === R.RED).length;
  return { a, b, games, aWinPct: Math.round(100 * wins / games) };
}

async function main() {
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
  const threads = +opt.threads || Math.max(1, Math.min(4, os.cpus().length));
  BUDGET = +opt.budget || 0;
  const seed = +opt.seed || 1;
  const player = s => (/^\d+$/.test(s) ? +s : s);
  const preset = opt.preset;

  if (!preset) {
    const games = +opt.games || 200;
    const res = summarize(`${opt.blue || 6} vs ${opt.red || 6}`, await runBatch(player(opt.blue || '6'), player(opt.red || '6'), games, seed, threads));
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  if (preset === 'balance' || preset === 'all') {
    for (const [lv, n] of [[6, +opt.games || 400], [8, 200], [9, 120]]) {
      console.log(JSON.stringify(summarize(`level ${lv} vs itself`, await runBatch(lv, lv, n, seed, threads))));
    }
  }
  if (preset === 'ladder' || preset === 'all') {
    for (let lv = 1; lv <= 9; lv++) {
      const r = await matchup(lv, 6, +opt.games || 240, seed + lv * 1000, threads);
      console.log(JSON.stringify({ ladder: `level ${lv} vs level 6`, games: r.games, winPct: r.aWinPct }));
    }
  }
  if (preset === 'beginner' || preset === 'all') {
    for (const lv of [1, 2, 3, 4]) {
      const r = await matchup('greedy', lv, +opt.games || 400, seed + lv * 7, threads);
      console.log(JSON.stringify({ beginner: `greedy vs level ${lv}`, games: r.games, greedyWinPct: r.aWinPct }));
    }
  }
}

if (isMainThread) main().catch(e => { console.error(e); process.exit(1); });
else {
  const { blue, red, games, seed0, budget } = workerData;
  BUDGET = budget || 0;
  const out = [];
  for (let i = 0; i < games; i++) out.push(playGame(blue, red, seed0 + i));
  parentPort.postMessage(out);
}
