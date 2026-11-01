#!/usr/bin/env node
/*
 * Updates the shipped puzzle collection (src/data/puzzles.js) without disturbing
 * players: puzzle ids and the daily rotation never change.
 *
 *  - Grades every pack puzzle for difficulty (tools/puzzles/lib.js: how many computer
 *    levels miss the first move, quiet moves, tempting captures, stubborn defenses) and
 *    orders each pack from easiest to hardest.
 *  - Adds the Expert (win in 4) and Grandmaster (win in 5) packs from
 *    tools/puzzles/deep-candidates.json (made by deep.js) when they don't exist yet:
 *    only puzzles whose first move is the one winning move, the hardest first chosen,
 *    then ordered easiest to hardest. Each stores its full line, how many moves win at
 *    each turn, and, at turns too deep for a phone to check quickly, every other
 *    winning move with its reply.
 *
 *   node tools/puzzles/build.js [--per-pack 50]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const { R, S } = L;

const FILE = path.join(__dirname, '../../src/data/puzzles.js');
const DEEP = path.join(__dirname, 'deep-candidates.json');
const opt = process.argv.indexOf('--per-pack');
const PER_PACK = opt >= 0 ? +process.argv[opt + 1] : 50;
const BUDGET = 3e7;
// A phone checks a move quickly while 2 or fewer of your moves remain after it.
const DEVICE_DEPTH = 2;

const data = JSON.parse(JSON.stringify(require(FILE)));
const posKey = p => p.rows.join('/') + '|' + p.stress.join(',');
const t0 = Date.now();

// ---- 1. every pack, easiest first -------------------------------------------------
const grades = new Map();
for (const pack of data.packs) {
  for (const z of pack.puzzles) grades.set(z.id, L.grade(z, BUDGET));
  pack.puzzles.sort((a, b) => grades.get(a.id).score - grades.get(b.id).score || a.id.localeCompare(b.id));
  const s = pack.puzzles.map(z => grades.get(z.id).score);
  console.log(`${pack.name}: ordered easiest to hardest (difficulty ${s[0]} to ${s[s.length - 1]})`);
}

// ---- 2. the deep packs ---------------------------------------------------------------
const NEW = [
  { id: 'expert', name: 'Expert', n: 4, blurb: 'Win in 4 moves', prefix: 'e' },
  { id: 'grandmaster', name: 'Grandmaster', n: 5, blurb: 'Win in 5 moves', prefix: 'g' }
];
const used = new Set(data.packs.flatMap(p => p.puzzles).concat(data.daily).map(posKey));
const deep = fs.existsSync(DEEP) ? JSON.parse(fs.readFileSync(DEEP, 'utf8')) : [];

// Every other winning move, with its reply, at your turns too deep for a phone to check.
function alternatives(p) {
  const alts = {};
  let st = L.stateOf(p);
  for (let step = 0; step * 2 < p.line.length; step++) {
    const left = p.n - step; // your moves left, this one included
    if (left - 1 > DEVICE_DEPTH) {
      const known = {};
      if (p.duals[step] > 1) {
        const wins = S.winningMoves(st, left, BUDGET);
        if (!wins || wins.length !== p.duals[step]) return null;
        for (const w of wins) {
          const name = R.moveName(w);
          if (name === p.line[step * 2]) continue;
          const after = R.apply(st, w).state;
          if (after.winner === R.BLUE) continue; // an instant win never needs checking
          const d = S.bestDefense(after, left - 1, BUDGET);
          if (!d || d.escapes) return null;
          known[name] = R.moveName(d.move);
        }
      }
      alts[step] = known;
    }
    st = R.apply(st, L.parse(p.line[step * 2])).state;
    if (p.line[step * 2 + 1] && st.winner === -1) st = R.apply(st, L.parse(p.line[step * 2 + 1])).state;
  }
  return alts;
}

for (const spec of NEW) {
  if (data.packs.some(p => p.id === spec.id)) { console.log(`${spec.name}: already shipped, kept as is`); continue; }
  const pool = [];
  const seen = new Set();
  for (const p of deep) {
    const k = posKey(p);
    if (p.n !== spec.n || p.duals[0] !== 1 || (p.ends !== 'stress' && p.ends !== 'crown') || p.ply >= 60 || used.has(k) || seen.has(k)) continue;
    if (!L.replay(p).ok) continue;
    seen.add(k);
    pool.push(p);
  }
  // Hardest and cleanest first: what computers miss, then fewer alternatives at your second turn.
  const scored = pool.map(p => {
    const g = L.grade(p, BUDGET);
    return { p, g, pickScore: g.score - Math.min((p.duals[1] || 1) - 1, 8) * 1.5 + ((p.duals[1] || 1) === 1 ? 6 : 0) };
  }).sort((a, b) => b.pickScore - a.pickScore);
  const chosen = [];
  for (const c of scored) {
    if (chosen.length >= PER_PACK) break;
    const alts = alternatives(c.p);
    if (!alts) continue; // a budget ran out: leave it out rather than guess
    chosen.push(Object.assign(c, { alts }));
    used.add(posKey(c.p));
  }
  chosen.sort((a, b) => a.g.score - b.g.score);
  const puzzles = chosen.map(({ p, alts }, i) => {
    const z = { id: spec.prefix + String(i + 1).padStart(2, '0'), n: p.n, ends: p.ends, rows: p.rows, stress: p.stress, hits: p.hits, ply: p.ply, solution: p.line[0], line: p.line, duals: p.duals };
    if (Object.keys(alts).length) z.alts = alts;
    return z;
  });
  data.packs.push({ id: spec.id, name: spec.name, n: spec.n, blurb: spec.blurb, puzzles });
  const s = chosen.map(c => c.g.score);
  console.log(`${spec.name}: ${puzzles.length} of ${pool.length} candidates (difficulty ${s[0]} to ${s[s.length - 1]}; ` +
    `${chosen.filter(c => c.g.quiet).length} quiet first moves; ${chosen.filter(c => (c.p.duals[1] || 1) === 1).length} with a single winning second move)`);
}

fs.writeFileSync(FILE, '/* Generated by tools/puzzles (curate.js, then build.js) from engine-proven positions. Do not edit by hand. */\n' +
  '(function (root) {\n  const data = ' + JSON.stringify(data) + ';\n' +
  '  if (typeof module === \'object\' && module.exports) module.exports = data;\n  else root.StressPuzzles = data;\n' +
  '})(typeof self !== \'undefined\' ? self : this);\n');
console.log(`wrote ${path.relative(process.cwd(), FILE)}: ${data.packs.map(p => p.name + ' ' + p.puzzles.length).join(', ')}, daily ${data.daily.length} (unchanged) in ${Math.round((Date.now() - t0) / 1000)}s`);
