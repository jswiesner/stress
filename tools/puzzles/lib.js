/*
 * Shared helpers for the puzzle tools: board text, mirroring, solving a puzzle's
 * full line, and grading how hard it is for a person.
 */
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '../../src/rules.js'));
const S = require(path.join(__dirname, '../../src/solver.js'));
const AI = require(path.join(__dirname, '../../src/ai.js'));

const SYM = ['.', 'c', 'g', 'r', 'j'];
function rowsOf(st) {
  const rows = [];
  for (let r = 0; r < 7; r++) {
    let s = '';
    for (let c = 0; c < 7; c++) {
      const i = r * 7 + c, o = st.owner[i];
      s += o < 0 ? '.' : o === R.BLUE ? SYM[st.type[i]].toUpperCase() : SYM[st.type[i]];
    }
    rows.push(s);
  }
  return rows;
}

// Swap colors and flip the board so the side to move is Blue at the bottom.
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

const hitsOf = st => { const h = {}; for (let i = 0; i < 49; i++) if (st.hits[i]) h[R.squareName(i)] = st.hits[i]; return h; };
const stateOf = p => R.fromRows(p.rows, { stress: p.stress, hits: p.hits, ply: p.ply });
const parse = name => R.makeMove(R.squareIndex(name.slice(0, 2)), R.squareIndex(name.slice(3)));

/*
 * The puzzle's whole line against the solver's most stubborn defense:
 * [your move, reply, your move, reply, ...] until Blue has won. duals[k] is how many
 * moves win at your k-th turn (1 means only one does). null if the budget ran out.
 */
function solveLine(pos, n, budget, rootWins) {
  let st = R.clone(pos);
  const line = [], duals = [];
  for (let k = n; k >= 1; k--) {
    const wins = k === n && rootWins ? rootWins : S.winningMoves(st, k, budget);
    if (!wins || !wins.length) return null;
    duals.push(wins.length);
    st = R.apply(st, wins[0]).state;
    line.push(R.moveName(wins[0]));
    if (st.winner !== -1) break;
    const d = S.bestDefense(st, k - 1, budget);
    if (!d || d.escapes || d.move === null) return null;
    st = R.apply(st, d.move).state;
    line.push(R.moveName(d.move));
    if (st.winner !== -1) break;
  }
  return st.winner === R.BLUE ? { line, duals, ends: st.reason } : null;
}

// Replay a stored line: does it end in a Blue win, after exactly n of Blue's moves?
function replay(p) {
  let st = stateOf(p), blue = 0;
  for (const name of p.line) {
    const m = parse(name);
    if (!R.isLegal(st, m)) return { ok: false, why: 'illegal ' + name };
    if (st.turn === R.BLUE) blue++;
    st = R.apply(st, m).state;
    if (st.winner !== -1) break;
  }
  return { ok: st.winner === R.BLUE && blue === p.n, blue, winner: st.winner, reason: st.reason };
}

/*
 * How hard is this for a person? Measured, not guessed:
 * - miss: the share of computer players (levels 2-8, three seeds each) that don't find
 *   the first move. Shallow searchers miss quiet, deep ideas the way people do.
 * - quiet: the first move captures nothing.
 * - tempting: captures and raids at the start that look good but don't win.
 * - stubborn: how many replies to your first move still make you play out the whole line.
 */
function grade(p, budget) {
  const st = stateOf(p);
  const first = parse(p.solution || p.line[0]);
  const moves = R.moves(st);
  const loud = m => st.owner[R.moveTo(m)] !== -1 || (R.inEnemyHalf(R.moveTo(m), R.BLUE) && !R.inEnemyHalf(R.moveFrom(m), R.BLUE));
  const quiet = st.owner[R.moveTo(first)] === -1;
  const tempting = moves.filter(m => m !== first && loud(m)).length;
  let misses = 0, tries = 0;
  for (let level = 2; level <= 8; level++) {
    for (let seed = 1; seed <= 3; seed++) {
      tries++;
      const res = AI.chooseMove(st, { level, rng: AI.makeRng(seed * 7919 + level), budgetMs: 0 });
      if (res.move !== first) misses++;
    }
  }
  // Stubbornness right after the first move: how many defenses still make you play
  // the whole line (the rest of a deep line follows the same idea and costs much more).
  let stubborn = 0;
  const after1 = R.apply(st, first).state;
  if (after1.winner === -1 && p.n > 1) {
    for (const reply of R.moves(after1)) {
      const s2 = R.apply(after1, reply).state;
      if (s2.winner === -1 && S.winDistance(s2, p.n - 1, budget) === p.n - 1) stubborn++;
    }
  }
  const miss = misses / tries;
  const score = 100 * miss + (quiet ? 12 : 0) + Math.min(tempting, 10) * 1.5 + Math.min(stubborn, 12) * 1.2 + p.n * 4;
  return { miss: +miss.toFixed(2), quiet, tempting, stubborn, score: +score.toFixed(1) };
}

module.exports = { R, S, AI, rowsOf, mirror, hitsOf, stateOf, parse, solveLine, replay, grade };
