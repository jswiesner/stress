#!/usr/bin/env node
/*
 * Updates the shipped puzzle collection (src/data/puzzles.js) without breaking
 * players' progress: a puzzle id always means the same puzzle, and the dailies
 * around today never change. tools/puzzles/shipped.json records every id ever
 * shipped with its fingerprint; retired ids are never reused.
 *
 *  1. Removes near-duplicates (lib.js nearDuplicate, which also sees mirror images)
 *     within each pack and within the daily rotation, keeping the first of each group.
 *  2. Refills every pack to its size with fresh, re-proven puzzles of similar
 *     difficulty that look like nothing else in the collection. A replaced daily is
 *     swapped in place for a fresh puzzle of the same length, keeping the weekly rhythm.
 *  3. Adds the Expert (win in 4) and Grandmaster (win in 5) packs if they're missing,
 *     from tools/puzzles/deep-candidates.json (deep.js): one winning first move, the
 *     hardest first. Deep puzzles store their full line, how many moves win at each
 *     turn, and, at turns too deep for a phone to check quickly, every other winning
 *     move with its reply.
 *  4. Grades every puzzle (how many computer levels miss the first move, quiet moves,
 *     tempting captures, stubborn defenses) and orders each pack easiest to hardest.
 *
 *   node tools/puzzles/build.js [--per-pack 50] [--today YYYY-MM-DD]
 *
 * Running it again on its own output changes nothing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const P = require('../../src/progress.js');
const { R, S } = L;

const FILE = path.join(__dirname, '../../src/data/puzzles.js');
const SHALLOW = path.join(__dirname, 'candidates.json');
const DEEP = path.join(__dirname, 'deep-candidates.json');
const SHIPPED = path.join(__dirname, 'shipped.json');
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const PER_PACK = +(arg('--per-pack') || 50);
const TODAY = arg('--today') || P.dayKey();
const BUDGET = 3e7;
const DEVICE_DEPTH = 2; // a phone checks a move quickly while 2 or fewer of your moves remain after it
const t0 = Date.now();

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const data = JSON.parse(JSON.stringify(require(FILE)));
const shallow = fs.existsSync(SHALLOW) ? read(SHALLOW) : [];
const deep = fs.existsSync(DEEP) ? read(DEEP) : [];
const everything = () => data.packs.flatMap(p => p.puzzles).concat(data.daily);

// ---- 0. the registry of shipped ids ---------------------------------------------------
const shipped = fs.existsSync(SHIPPED) ? read(SHIPPED) : { ids: {}, retired: [] };
if (!Object.keys(shipped.ids).length) for (const z of everything()) shipped.ids[z.id] = L.fingerprint(z);
for (const z of everything()) {
  if (shipped.retired.includes(z.id)) throw new Error(z.id + ' was retired and must not come back');
  if (shipped.ids[z.id] && shipped.ids[z.id] !== L.fingerprint(z)) throw new Error(z.id + ' no longer matches the puzzle it shipped as');
}
const nextId = (prefix, width) => {
  let n = 0;
  for (const id of Object.keys(shipped.ids).concat(shipped.retired)) if (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length))) n = Math.max(n, +id.slice(prefix.length));
  const id = prefix + String(n + 1).padStart(width, '0');
  shipped.ids[id] = 'reserved';
  return id;
};

const grades = new Map();
const gradeOf = z => { const k = L.fingerprint(z); if (!grades.has(k)) grades.set(k, L.grade(z, BUDGET)); return grades.get(k); };
const fresh = (c, also) => !everything().concat(also || []).some(z => L.nearDuplicate(z, c));

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

// A shipped puzzle record from a candidate, re-proved; null if it doesn't hold up.
const FIRSTS = { 1: 2, 2: 1, 3: 1 };
function toPuzzle(c, id) {
  const base = { id, n: c.n, ends: c.ends, rows: c.rows, stress: c.stress, hits: c.hits, ply: c.ply, solution: c.solution || c.line[0] };
  if (c.n <= 3) {
    const st = L.stateOf(c);
    if (S.winDistance(st, c.n, 6e6) !== c.n) return null;
    const wins = (S.winningMoves(st, c.n, 6e6) || []).map(R.moveName);
    if (!wins.includes(base.solution) || wins.length > FIRSTS[c.n]) return null;
    return base;
  }
  if (!L.replay(c).ok) return null;
  const alts = alternatives(c);
  if (!alts) return null;
  return Object.assign(base, { line: c.line, duals: c.duals }, Object.keys(alts).length ? { alts } : {});
}

// Candidates that could join a set of n-move puzzles.
function pool(n, forDaily) {
  const ok = c => c.n === n && (c.ends === 'stress' || c.ends === 'crown') && c.ply < 60;
  if (n >= 4) return deep.filter(c => ok(c) && c.duals[0] === 1);
  return shallow.filter(c => ok(c) && c.firsts <= (forDaily ? 1 : FIRSTS[n]) && c.pieces >= (n === 1 ? 3 : 4));
}

// The fresh candidate closest in difficulty to `target`, proven and turned into a puzzle.
function replacement(n, target, id, forDaily, taken) {
  // A fixed sample keeps grading time down; the order only depends on the candidates.
  const options = pool(n, forDaily).filter(c => !taken.has(L.fingerprint(c)) && fresh(c))
    .sort((a, b) => L.fingerprint(a).localeCompare(L.fingerprint(b))).slice(0, 160);
  options.sort((a, b) => Math.abs(gradeOf(a).score - target) - Math.abs(gradeOf(b).score - target) || L.fingerprint(a).localeCompare(L.fingerprint(b)));
  for (const c of options) {
    taken.add(L.fingerprint(c));
    const z = toPuzzle(c, id);
    if (z) return z;
  }
  return null;
}

const report = [];
const taken = new Set();

// ---- 1. the deep packs, if they're missing ---------------------------------------------
const NEW = [
  { id: 'expert', name: 'Expert', n: 4, blurb: 'Win in 4 moves', prefix: 'e' },
  { id: 'grandmaster', name: 'Grandmaster', n: 5, blurb: 'Win in 5 moves', prefix: 'g' }
];
for (const spec of NEW) {
  if (data.packs.some(p => p.id === spec.id)) continue;
  const pack = { id: spec.id, name: spec.name, n: spec.n, blurb: spec.blurb, puzzles: [] };
  data.packs.push(pack);
  // Hardest and cleanest first: what computers miss, then fewer alternatives at your second turn.
  const ranked = pool(spec.n).map(c => ({ c, pick: gradeOf(c).score - Math.min((c.duals[1] || 1) - 1, 8) * 1.5 + ((c.duals[1] || 1) === 1 ? 6 : 0) }))
    .sort((a, b) => b.pick - a.pick);
  for (const { c } of ranked) {
    if (pack.puzzles.length >= PER_PACK) break;
    if (!fresh(c)) continue;
    const z = toPuzzle(c, nextId(spec.prefix, 2));
    if (z) pack.puzzles.push(z);
  }
  report.push(`${spec.name}: new pack of ${pack.puzzles.length}`);
}

// ---- 2. near-duplicates within each pack, refilled ---------------------------------------
for (const pack of data.packs) {
  const size = pack.puzzles.length;
  const kept = [], dropped = [];
  for (const z of pack.puzzles) (kept.some(k => L.nearDuplicate(k, z)) ? dropped : kept).push(z);
  if (!dropped.length) continue;
  pack.puzzles = kept;
  const prefix = pack.puzzles[0].id.replace(/\d+$/, '');
  for (const old of dropped) {
    shipped.retired.push(old.id);
    const z = replacement(pack.n, gradeOf(old).score, nextId(prefix, 2), false, taken);
    if (!z) throw new Error(`no fresh ${pack.n}-move puzzle left to replace ${old.id}; run the generator for more`);
    pack.puzzles.push(z);
    report.push(`${pack.name}: ${old.id} looked like another puzzle, replaced by ${z.id}`);
  }
  if (pack.puzzles.length !== size) throw new Error(pack.name + ' changed size');
}

// ---- 3. near-duplicates within the daily rotation, replaced in place --------------------
{
  const N = data.daily.length, today = ((P.dayNumber(TODAY) % N) + N) % N;
  // Dailies a player might be looking at (yesterday to three days ahead) never change.
  const locked = new Set([-1, 0, 1, 2, 3].map(k => (today + k + N) % N));
  const order = Array.from({ length: N }, (_, k) => (today + k) % N); // soonest first
  const kept = order.filter(i => locked.has(i)).map(i => data.daily[i]);
  for (const i of order) {
    if (locked.has(i)) continue;
    const z = data.daily[i];
    if (!kept.some(k => L.nearDuplicate(k, z))) { kept.push(z); continue; }
    shipped.retired.push(z.id);
    const swap = replacement(z.n, gradeOf(z).score, nextId('d', 3), true, taken);
    if (!swap) throw new Error('no fresh puzzle left to replace daily ' + z.id);
    data.daily[i] = swap;
    kept.push(swap);
    report.push(`Daily: ${z.id} (day ${i + 1} of ${N}) looked like another daily, replaced in place by ${swap.id}`);
  }
}

// ---- 4. every pack, easiest first ---------------------------------------------------------
for (const pack of data.packs) {
  pack.puzzles.sort((a, b) => gradeOf(a).score - gradeOf(b).score || a.id.localeCompare(b.id));
}

// ---- record and write ----------------------------------------------------------------
for (const id of Object.keys(shipped.ids)) if (shipped.ids[id] === 'reserved') delete shipped.ids[id];
for (const z of everything()) shipped.ids[z.id] = L.fingerprint(z);
for (const id of shipped.retired) if (everything().some(z => z.id === id)) throw new Error('retired ' + id + ' is still in use');
shipped.retired = [...new Set(shipped.retired)].sort();
fs.writeFileSync(SHIPPED, JSON.stringify({
  about: 'Every puzzle id ever shipped, with its fingerprint (tools/puzzles/lib.js). An id must always mean the same puzzle; retired ids are never reused. Maintained by tools/puzzles/build.js.',
  ids: Object.fromEntries(Object.entries(shipped.ids).sort(([a], [b]) => a.localeCompare(b))),
  retired: shipped.retired
}, null, 1) + '\n');
fs.writeFileSync(FILE, '/* Generated by tools/puzzles (curate.js, then build.js) from engine-proven positions. Do not edit by hand. */\n' +
  '(function (root) {\n  const data = ' + JSON.stringify(data) + ';\n' +
  '  if (typeof module === \'object\' && module.exports) module.exports = data;\n  else root.StressPuzzles = data;\n' +
  '})(typeof self !== \'undefined\' ? self : this);\n');
report.forEach(line => console.log(line));
console.log(`wrote ${path.relative(process.cwd(), FILE)}: ${data.packs.map(p => p.name + ' ' + p.puzzles.length).join(', ')}, daily ${data.daily.length}` +
  ` | ${report.length ? report.length + ' changes' : 'no changes'} in ${Math.round((Date.now() - t0) / 1000)}s`);
