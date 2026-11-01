/*
 * Stress puzzle solver: exact "can the side to move force a win within N of
 * its moves?" search over the real rules (src/rules.js).
 *
 * A win within N moves means: after the solver's Nth move, either the enemy
 * Crown is captured or the enemy has cracked (10 Stress) by the start of the
 * solver's next turn, whatever the defender does. In plies that is 2N.
 *
 * Used by the puzzle mode (checking the player's moves, choosing the
 * defender's reply, hints) and by tools/puzzles to generate puzzles.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const R = isNode ? require('./rules.js') : root.StressRules;
  const api = factory(R);
  if (isNode) module.exports = api;
  else root.StressSolver = api;
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';
  const { CELLS, CROWN, HALF } = { CELLS: R.CELLS, CROWN: R.CROWN, HALF: R.tables.HALF };
  const VALUE = [0, 1000, 5, 4, 4];

  function key(st) {
    // Position identity for the transposition table. The ply only matters near the round limit.
    let k = st.turn + ':' + st.stress[0] + ',' + st.stress[1] + (st.suddenDeath ? 's' : '') + (st.ply >= 2 * R.ROUND_LIMIT - 12 ? 'p' + st.ply : '') + ':';
    for (let i = 0; i < CELLS; i++) k += st.owner[i] < 0 ? '.' : String.fromCharCode(97 + st.type[i] * 8 + st.owner[i] * 4 + st.hits[i]);
    return k;
  }

  // Attacker: try wins first (Crown captures, captures, raids). Defender: try refutations first.
  function ordered(st, moves, attacking) {
    const p = st.turn;
    const score = m => {
      const from = m >> 6, to = m & 63;
      let s = 0;
      if (st.owner[to] !== -1) s += st.type[to] === CROWN ? 1e6 : 1000 + VALUE[st.type[to]] * 10;
      if (attacking) { if (HALF[to] === 1 - p) s += 50; }
      else {
        if (st.type[from] === CROWN) s += 30; // dodge with the Crown
        if (HALF[from] === 1 - p && HALF[to] !== 1 - p) s += 10;
      }
      return s;
    };
    return moves.map(m => [score(m), m]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  }

  function Searcher(budget) {
    this.nodes = 0;
    this.budget = budget || Infinity;
    this.tt = new Map();
    this.aborted = false;
  }
  const ABORT = { abort: true };

  // Can `attacker` force a win within `plies` plies from here?
  Searcher.prototype.win = function (st, plies, attacker) {
    if (st.winner !== -1) return st.winner === attacker;
    if (plies <= 0) return false;
    if (++this.nodes > this.budget) { this.aborted = true; throw ABORT; }
    const k = key(st) + '|' + attacker;
    const known = this.tt.get(k);
    if (known !== undefined) {
      if (known >= 0 && known <= plies) return true; // a win this fast is known
      if (known < 0 && -known >= plies) return false; // no win within at least this many plies
    }
    const moves = R.moves(st);
    let result;
    if (st.turn === attacker) {
      result = false;
      if (moves.length) {
        for (const m of ordered(st, moves, true)) {
          const t = R.play(st, m);
          const ok = this.win(st, plies - 1, attacker);
          R.undo(st, t);
          if (ok) { result = true; break; }
        }
      }
    } else {
      result = true; // a defender with no legal move loses
      for (const m of ordered(st, moves, false)) {
        const t = R.play(st, m);
        const ok = this.win(st, plies - 1, attacker);
        R.undo(st, t);
        if (!ok) { result = false; break; }
      }
    }
    if (result) this.tt.set(k, Math.min(plies, known >= 0 ? known : Infinity));
    else this.tt.set(k, -Math.max(plies, known < 0 ? -known : 0));
    return result;
  };

  function run(fn, budget) {
    const s = new Searcher(budget);
    try { return { value: fn(s), nodes: s.nodes, complete: true }; }
    catch (e) { if (e === ABORT) return { value: null, nodes: s.nodes, complete: false }; throw e; }
  }

  /** Can the side to move force a win within `n` of its own moves? (null if the budget ran out) */
  function forcedWin(state, n, budget) {
    const st = R.clone(state), me = st.turn;
    return run(s => s.win(st, 2 * n, me), budget).value;
  }

  /** Smallest n <= maxN with a forced win for the side to move, 0 if none, null if undecided. */
  function winDistance(state, maxN, budget) {
    const st = R.clone(state), me = st.turn;
    const r = run(s => {
      for (let n = 1; n <= maxN; n++) if (s.win(st, 2 * n, me)) return n;
      return 0;
    }, budget);
    return r.value;
  }

  /** Every move for the side to move that keeps a forced win within `n` moves. */
  function winningMoves(state, n, budget) {
    const st = R.clone(state), me = st.turn;
    const r = run(s => {
      const out = [];
      for (const m of ordered(st, R.moves(st), true)) {
        const t = R.play(st, m);
        const ok = s.win(st, 2 * n - 1, me);
        R.undo(st, t);
        if (ok) out.push(m);
      }
      return out;
    }, budget);
    return r.value;
  }

  /**
   * The defender's most stubborn reply: one that escapes if possible, otherwise the one
   * that makes the attacker need the most moves. Returns { move, escapes, movesLeft }.
   */
  function bestDefense(state, attackerMovesLeft, budget) {
    const st = R.clone(state), defender = st.turn, attacker = 1 - defender;
    const r = run(s => {
      let best = null, bestNeed = -1;
      for (const m of ordered(st, R.moves(st), false)) {
        const t = R.play(st, m);
        let need = 0;
        if (st.winner === attacker) need = 0;
        else if (st.winner === defender) need = Infinity;
        else {
          need = Infinity;
          // Attacker to move with k moves left: a win lands within 2k plies (a Stress win
          // arrives with the defender's reply after the attacker's k-th move).
          for (let k = 1; k <= attackerMovesLeft; k++) if (s.win(st, 2 * k, attacker)) { need = k; break; }
        }
        R.undo(st, t);
        if (need > bestNeed) { bestNeed = need; best = m; }
        if (need === Infinity) break;
      }
      return { move: best, escapes: bestNeed === Infinity, movesLeft: bestNeed === Infinity ? -1 : bestNeed };
    }, budget);
    return r.value;
  }

  return { forcedWin, winDistance, winningMoves, bestDefense, key };
});
