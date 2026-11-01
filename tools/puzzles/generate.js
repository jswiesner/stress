#!/usr/bin/env node
/*
 * Puzzle generator. Plays computer-vs-computer games, finds positions where the
 * side to move can force a win in 1, 2 or 3 moves (proved by src/solver.js),
 * keeps the interesting ones and writes src/data/puzzles.js.
 *
 *   node tools/puzzles/generate.js [--games 1200] [--threads 4]
 *
 * Every puzzle is stored with Blue to move (positions are mirrored when needed),
 * its exact distance to a win, how many first moves win, and how it ends.
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const R = require(path.join(__dirname, '../../src/rules.js'));
const AI = require(path.join(__dirname, '../../src/ai.js'));
const S = require(path.join(__dirname, '../../src/solver.js'));

const sym = ['.', 'c', 'g', 'r', 'j'];
function rowsOf(st) {
  const rows = [];
  for (let r = 0; r < 7; r++) {
    let s = '';
    for (let c = 0; c < 7; c++) {
      const i = r * 7 + c, o = st.owner[i];
      s += o < 0 ? '.' : o === R.BLUE ? sym[st.type[i]].toUpperCase() : sym[st.type[i]];
    }
    rows.push(s);
  }
  return rows;
}

// Swap colors and flip the board so the side to move is always Blue at the bottom.
function mirror(st) {
  const m = R.clone(st);
  for (let i = 0; i < 49; i++) {
    const j = (6 - Math.floor(i / 7)) * 7 + (i % 7);
    m.type[j] = st.type[i];
    m.owner[j] = st.owner[i] < 0 ? -1 : 1 - st.owner[i];
    m.hits[j] = st.hits[i];
  }
  m.stress = [st.stress[1], st.stress[0]];
  m.turn = 1 - st.turn;
  m.first = 1 - st.first;
  return m;
}

// Play the main line (best attack against best defense) to see how the win lands.
function ending(st, n) {
  let s = R.clone(st);
  for (let k = n; k >= 1 && s.winner === -1; k--) {
    const wins = S.winningMoves(s, k, 2e6) || [];
    if (!wins.length) return 'unknown';
    s = R.apply(s, wins[0]).state;
    if (s.winner !== -1) break;
    const d = S.bestDefense(s, k - 1 || 1, 2e6);
    if (!d || d.move === null) break;
    s = R.apply(s, d.move).state;
  }
  return s.winner === R.BLUE ? s.reason : 'unknown';
}

function work(games, seed0) {
  const out = [];
  const seen = new Set();
  for (let g = 0; g < games; g++) {
    const rng = AI.makeRng(seed0 + g);
    const lvA = 4 + Math.floor(rng() * 5), lvB = 4 + Math.floor(rng() * 5);
    let st = R.newGame({ first: g % 2 });
    while (st.winner === -1) {
      if (st.ply >= 8) {
        const pos = st.turn === R.BLUE ? R.clone(st) : mirror(st);
        const k = S.key(pos);
        if (!seen.has(k)) {
          seen.add(k);
          const n = S.winDistance(pos, 3, 4e6);
          if (n) {
            const firsts = S.winningMoves(pos, n, 4e6) || [];
            if (firsts.length && firsts.length <= 3) {
              const hits = {};
              for (let i = 0; i < 49; i++) if (pos.hits[i]) hits[R.squareName(i)] = pos.hits[i];
              out.push({
                n, firsts: firsts.length, solution: R.moveName(firsts[0]), ends: ending(pos, n),
                rows: rowsOf(pos), stress: pos.stress.slice(), hits, ply: pos.ply,
                pieces: R.pieceCount(pos, 0) + R.pieceCount(pos, 1)
              });
            }
          }
        }
      }
      const res = AI.chooseMove(st, { level: st.turn === R.BLUE ? lvA : lvB, rng, budgetMs: 0 });
      st = R.apply(st, res.move).state;
    }
  }
  return out;
}

if (!isMainThread) {
  parentPort.postMessage(work(workerData.games, workerData.seed0));
} else {
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
  const games = +opt.games || 1200, threads = +opt.threads || Math.min(4, os.cpus().length);
  const per = Math.ceil(games / threads);
  const t0 = Date.now();
  Promise.all(Array.from({ length: threads }, (_, t) => new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { games: per, seed0: 1000 + t * 100000 } });
    w.on('message', resolve);
    w.on('error', reject);
  }))).then(parts => {
    const all = parts.flat();
    const file = path.join(__dirname, 'candidates.json');
    fs.writeFileSync(file, JSON.stringify(all));
    const by = {};
    all.forEach(p => { const k = p.n + ':' + p.ends + ':' + p.firsts; by[k] = (by[k] || 0) + 1; });
    console.log(`${all.length} candidates from ${games} games in ${Math.round((Date.now() - t0) / 1000)}s -> ${file}`);
    console.log(by);
  });
}
