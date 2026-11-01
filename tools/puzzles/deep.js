#!/usr/bin/env node
/*
 * Deep puzzle generator: forced wins in exactly 4 or 5 moves.
 *
 * Plays computer-vs-computer games and, after each decisive game, looks at the
 * positions a few moves before the end with the eventual winner to move. That is
 * where long forced wins hide, so it finds them far faster than random sampling.
 * Each find is proved exactly (no shorter win, a single winning first move), then
 * its whole line against the most stubborn defense is stored, with how many moves
 * win at each step.
 *
 *   node tools/puzzles/deep.js [--minutes 90] [--threads 3] [--out FILE]
 *
 * Results stream into tools/puzzles/deep-candidates.json, or FILE (rewritten as
 * they arrive, so a stopped run keeps what it found, and a new run adds to it).
 * tools/puzzles/build.js turns them into packs.
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const L = require('./lib.js');
const { R, S, AI } = L;

const DEFAULT_OUT = path.join(__dirname, 'deep-candidates.json');

function work({ seed0, deadline }) {
  const seen = new Set();
  let positions = 0;
  for (let g = 0; Date.now() < deadline; g++) {
    const rng = AI.makeRng(seed0 + g);
    const lvA = 4 + Math.floor(rng() * 5), lvB = 4 + Math.floor(rng() * 5);
    let st = R.newGame({ first: g % 2 });
    const trail = [];
    while (st.winner === -1 && Date.now() < deadline) {
      trail.push(R.clone(st));
      st = R.apply(st, AI.chooseMove(st, { level: st.turn === R.BLUE ? lvA : lvB, rng, budgetMs: 0 }).move).state;
    }
    if (st.winner !== R.BLUE && st.winner !== R.RED) continue;
    if (st.reason !== 'stress' && st.reason !== 'crown') continue;
    const winner = st.winner;
    // The winner to move, 4 to 8 of their moves before the end.
    const picks = trail.filter((s, i) => s.turn === winner && trail.length - i >= 7 && trail.length - i <= 16 && s.ply >= 8 && s.ply < 60 && !s.suddenDeath);
    for (const s of picks) {
      if (Date.now() >= deadline) break;
      const pos = s.turn === R.BLUE ? R.clone(s) : L.mirror(s);
      const key = S.key(pos);
      if (seen.has(key)) continue;
      seen.add(key);
      positions++;
      if (S.winDistance(pos, 3, 4e6) !== 0) continue; // a short win, or undecided
      let n = 0;
      const in4 = S.forcedWin(pos, 4, 1.5e7);
      if (in4) n = 4;
      else if (in4 === false && S.forcedWin(pos, 5, 4e7)) n = 5;
      if (!n) continue;
      const roots = S.winningMoves(pos, n, 5e7);
      if (!roots || roots.length !== 1) { parentPort.postMessage({ type: 'skip', n, why: roots ? 'firsts:' + roots.length : 'budget' }); continue; }
      const solved = L.solveLine(pos, n, 5e7, roots);
      if (!solved) { parentPort.postMessage({ type: 'skip', n, why: 'line' }); continue; }
      parentPort.postMessage({
        type: 'found',
        puzzle: {
          n, rows: L.rowsOf(pos), stress: pos.stress.slice(), hits: L.hitsOf(pos), ply: pos.ply,
          solution: solved.line[0], line: solved.line, duals: solved.duals, ends: solved.ends,
          pieces: R.pieceCount(pos, 0) + R.pieceCount(pos, 1)
        }
      });
    }
    parentPort.postMessage({ type: 'progress', positions });
    positions = 0;
  }
  parentPort.postMessage({ type: 'done' });
}

if (!isMainThread) work(workerData);
else {
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
  const minutes = +opt.minutes || 90, threads = +opt.threads || Math.max(1, Math.min(3, os.cpus().length - 1));
  const OUT = opt.out ? path.resolve(opt.out) : DEFAULT_OUT;
  const deadline = Date.now() + minutes * 60e3, t0 = Date.now();
  const found = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const keys = new Set(found.map(p => p.rows.join('/') + p.stress.join(',')));
  const tally = { positions: 0, skips: {} };
  const save = () => fs.writeFileSync(OUT, JSON.stringify(found));
  const report = () => {
    const by = n => found.filter(p => p.n === n);
    const clean = n => by(n).filter(p => p.duals.slice(0, Math.max(1, n - 2)).every(d => d === 1)).length;
    console.log(`[${Math.round((Date.now() - t0) / 60e3)} min] positions ${tally.positions} | win in 4: ${by(4).length} (${clean(4)} unique until the finish) | win in 5: ${by(5).length} (${clean(5)}) | skipped ${JSON.stringify(tally.skips)}`);
  };
  const timer = setInterval(report, 5 * 60e3);
  let running = threads;
  for (let t = 0; t < threads; t++) {
    const w = new Worker(__filename, { workerData: { seed0: 500000 + t * 100000 + (Date.now() % 9973) * 7, deadline } });
    w.on('message', m => {
      if (m.type === 'found') {
        const k = m.puzzle.rows.join('/') + m.puzzle.stress.join(',');
        if (!keys.has(k)) { keys.add(k); found.push(m.puzzle); save(); }
      } else if (m.type === 'progress') tally.positions += m.positions;
      else if (m.type === 'skip') { const k = m.n + ':' + m.why; tally.skips[k] = (tally.skips[k] || 0) + 1; }
      else if (m.type === 'done') w.finished = true;
    });
    w.on('error', e => console.error('worker stopped:', e && e.message));
    // A worker that ends for any reason (done, or out of memory on a huge proof) is accounted for.
    w.on('exit', () => {
      if (--running > 0) return;
      clearInterval(timer); save(); report(); console.log('wrote ' + OUT); process.exit(0);
    });
  }
}
