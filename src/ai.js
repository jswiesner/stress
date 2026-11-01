/*
 * Stress 2.0 computer opponent.
 *
 * Negamax alpha-beta search with iterative deepening, a capture-only extension
 * at the end of each line (quiescence), killer-move ordering and an evaluation
 * that knows the game's priorities: Stress (weighted more heavily near 10),
 * raiders and their nerve, material, Crown safety and mobility.
 *
 * Levels 1-9 differ in how far ahead they look, how much noise they add to
 * their judgement and how often they "slip": play a random move they didn't
 * plan. A slip never hands over their own Crown.
 *
 * Runs in the AI Web Worker, on the page as a fallback, and in Node.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const R = isNode ? require('./rules.js') : root.StressRules;
  const api = factory(R);
  if (isNode) module.exports = api;
  else root.StressAI = api;
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const { CELLS, CROWN, GUARD, RUNNER, JUMPER, NERVE, DRAW, STRESS_LIMIT } = R;
  const { RAYS, LEAPS, HALF } = R.tables;

  // depth: plies searched (1 = its own move only). shallow: chance of looking only one ply
  // ahead this move. slip: chance of an unplanned move. noise: random +/- added to each judged
  // position. quiesce: follow captures past the horizon. Tuned with tools/sim (see README).
  const LEVELS = [
    null,
    { name: 'Chill', depth: 1, slip: 0.60, noise: 300, quiesce: false },
    { name: 'Chill', depth: 1, slip: 0.45, noise: 220, quiesce: false },
    { name: 'Chill', depth: 1, slip: 0.38, noise: 180, quiesce: false },
    { name: 'Steady', depth: 2, shallow: 0.30, slip: 0.10, noise: 70, quiesce: true },
    { name: 'Steady', depth: 2, slip: 0.05, noise: 45, quiesce: true },
    { name: 'Steady', depth: 2, slip: 0, noise: 30, quiesce: true },
    { name: 'Sharp', depth: 3, slip: 0.05, noise: 25, quiesce: true },
    { name: 'Sharp', depth: 3, slip: 0, noise: 10, quiesce: true },
    { name: 'Ruthless', depth: 4, maxDepth: 7, budgetMs: 600, slip: 0, noise: 6, quiesce: true }
  ];
  const MIN_LEVEL = 1, MAX_LEVEL = LEVELS.length - 1;

  const VALUE = [0, 0, 400, 330, 350]; // by piece type; the Crown is priceless (capture ends the game)
  const WIN = 100000;
  const MATE_ZONE = WIN - 1000;
  const TIMEOUT = { timeout: true };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Small, seedable PRNG so tests and the simulator are reproducible.
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Stress outlook: each point hurts more as it nears the limit.
  const stressCost = x => 70 * x + 7 * x * x;

  function mobility(st, sq, t, p) {
    let n = 0;
    if (t === JUMPER) {
      const leaps = LEAPS[sq];
      for (let i = 0; i < leaps.length; i++) if (st.owner[leaps[i]] !== p) n++;
      return n;
    }
    const rays = RAYS[t][sq];
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i];
      for (let k = 0; k < ray.length; k++) {
        const o = st.owner[ray[k]];
        if (o === -1) { n++; continue; }
        if (o !== p) n++;
        break;
      }
    }
    return n;
  }

  // Score from the point of view of the side to move.
  // The longer nothing happens (no capture, no Stress), the more the opponent values
  // raiding and pushing forward, so it never settles into a standoff.
  function evaluate(ctx, st) {
    const s = st.turn, o = 1 - s;
    const urge = 1 + Math.min(3, st.quiet / 8);
    let score = 0, incomingS = 0, incomingO = 0, crownRaidS = 0, crownRaidO = 0, crownS = -1, crownO = -1, advance = 0;
    for (let sq = 0; sq < CELLS; sq++) {
      const p = st.owner[sq];
      if (p < 0) continue;
      const t = st.type[sq], sign = p === s ? 1 : -1, row = (sq / 7) | 0;
      if (t === CROWN) {
        if (p === s) crownS = sq; else crownO = sq;
        if (HALF[sq] === p) score += sign * 18; // a Crown at home is a safe Crown
        else if (HALF[sq] === 1 - p) score -= sign * 45;
      } else {
        score += sign * VALUE[t];
        if (row >= 2 && row <= 4) score += sign * 8; // active pieces in or near the middle
        advance += sign * (p === 0 ? 6 - row : row); // rows travelled toward the enemy
      }
      if (HALF[sq] === 1 - p && t === CROWN) {
        // A raiding Crown hits every turn but risks the game, so it counts for less.
        if (p === s) crownRaidO++; else crownRaidS++;
      } else if (HALF[sq] === 1 - p) {
        if (p === s) incomingO++; else incomingS++;
        // A raider with one hit of nerve left cracks next turn unless it is pulled back.
        if (t !== CROWN && st.hits[sq] >= NERVE - 1) score -= sign * VALUE[t] * 0.45;
      }
      score += sign * 3 * mobility(st, sq, t, p);
    }
    const so = st.stress[o], ss = st.stress[s];
    score += stressCost(so) - stressCost(ss);
    score += urge * ((stressCost(so + 0.75 * incomingO) - stressCost(so)) - (stressCost(ss + 0.75 * incomingS) - stressCost(ss)));
    score += (stressCost(so + 0.4 * crownRaidO) - stressCost(so)) - (stressCost(ss + 0.4 * crownRaidS) - stressCost(ss));
    score += urge * 3 * advance;
    if (crownO >= 0 && R.isAttackedBy(st, crownO, s)) score += 3000; // we can take their Crown next
    if (crownS >= 0) {
      if (R.isAttackedBy(st, crownS, o)) score -= 60;
      score += 6 * Math.min(3, neighbours(st, crownS, s)) - 12 * nearby(st, crownS, o);
    }
    if (ctx.noise) score += (ctx.rng() * 2 - 1) * ctx.noise;
    return score;
  }
  function neighbours(st, sq, p) {
    const r = (sq / 7) | 0, c = sq % 7;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 7 && nc >= 0 && nc < 7 && st.owner[nr * 7 + nc] === p) n++;
    }
    return n;
  }
  function nearby(st, sq, p) {
    const r = (sq / 7) | 0, c = sq % 7;
    let n = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 7 && nc >= 0 && nc < 7 && st.owner[nr * 7 + nc] === p) n++;
    }
    return n;
  }

  function terminal(st, ply) {
    if (st.winner === DRAW) return 0;
    return st.winner === st.turn ? WIN - ply : -(WIN - ply);
  }

  // Move ordering: best move from the last iteration, captures (most valuable victim first),
  // killer moves, pulling back raiders about to crack, raids, everything else.
  function order(ctx, st, moves, ply, first) {
    const k0 = ctx.killers[ply * 2], k1 = ctx.killers[ply * 2 + 1], p = st.turn;
    const keyed = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], from = m >> 6, to = m & 63;
      let key;
      if (m === first) key = 1e9;
      else if (st.owner[to] !== -1) key = st.type[to] === CROWN ? 1e8 : 1e6 + 10 * VALUE[st.type[to]] - VALUE[st.type[from]];
      else if (m === k0 || m === k1) key = 9e5;
      else {
        key = ctx.history[m] || 0;
        if (HALF[from] === 1 - p && HALF[to] !== 1 - p && st.hits[from] >= NERVE - 1) key += 2000;
        else if (HALF[to] === 1 - p && HALF[from] !== 1 - p) key += 500;
      }
      keyed[i] = [key, m];
    }
    keyed.sort((a, b) => b[0] - a[0]);
    for (let i = 0; i < moves.length; i++) moves[i] = keyed[i][1];
    return moves;
  }

  function checkTime(ctx) {
    if (ctx.deadline && (++ctx.ticks & 255) === 0 && now() > ctx.deadline) throw TIMEOUT;
  }

  function negamax(ctx, st, depth, alpha, beta, ply) {
    if (st.winner !== -1) return terminal(st, ply);
    if (depth <= 0) return ctx.quiesce ? quiesce(ctx, st, alpha, beta, ply, 6) : evaluate(ctx, st);
    ctx.nodes++;
    checkTime(ctx);
    const moves = R.moves(st);
    if (!moves.length) return -(WIN - ply); // no legal move: the side to move loses
    order(ctx, st, moves, ply, 0);
    let best = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], quiet = st.owner[m & 63] === -1;
      const token = R.play(st, m);
      const v = -negamax(ctx, st, depth - 1, -beta, -alpha, ply + 1);
      R.undo(st, token);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (quiet) {
          if (ctx.killers[ply * 2] !== m) { ctx.killers[ply * 2 + 1] = ctx.killers[ply * 2]; ctx.killers[ply * 2] = m; }
          ctx.history[m] = (ctx.history[m] || 0) + depth * depth;
        }
        break;
      }
    }
    return best;
  }

  function quiesce(ctx, st, alpha, beta, ply, left) {
    if (st.winner !== -1) return terminal(st, ply);
    ctx.nodes++;
    checkTime(ctx);
    const stand = evaluate(ctx, st);
    if (left <= 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const all = R.moves(st), caps = [];
    for (let i = 0; i < all.length; i++) if (st.owner[all[i] & 63] !== -1) caps.push(all[i]);
    if (!caps.length) return stand;
    order(ctx, st, caps, ply, 0);
    for (let i = 0; i < caps.length; i++) {
      const token = R.play(st, caps[i]);
      const v = -quiesce(ctx, st, -beta, -alpha, ply + 1, left - 1);
      R.undo(st, token);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function searchRoot(ctx, st, moves, depth, first) {
    order(ctx, st, moves, 0, first);
    let best = moves[0], bestScore = -Infinity, alpha = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const token = R.play(st, moves[i]);
      const v = -negamax(ctx, st, depth - 1, -Infinity, -alpha, 1);
      R.undo(st, token);
      if (v > bestScore) { bestScore = v; best = moves[i]; }
      if (v > alpha) alpha = v;
    }
    return { move: best, score: bestScore };
  }

  // Would playing `m` let the opponent capture our Crown straight away?
  function handsOverCrown(st, m) {
    const me = st.turn, token = R.play(st, m);
    let bad = false;
    if (st.winner === -1) {
      const crown = R.crownSquare(st, me);
      bad = crown >= 0 && R.isAttackedBy(st, crown, st.turn);
    }
    R.undo(st, token);
    return bad;
  }

  /**
   * Pick a move for the side to move. Does not modify `state`.
   * opts: level (1-9), seed or rng, budgetMs (override the level's time budget).
   * Returns { move, score, depth, nodes, ms, slipped } or null when there is no legal move.
   */
  function chooseMove(state, opts) {
    opts = opts || {};
    const level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, opts.level | 0 || 5));
    const L = LEVELS[level];
    const rng = opts.rng || makeRng(opts.seed === undefined ? (Math.random() * 4294967296) >>> 0 : opts.seed);
    const st = R.clone(state);
    const started = now();
    const moves = R.moves(st);
    if (!moves.length) return null;
    const result = (move, score, depth, nodes, slipped) => ({ move, score, depth, nodes, ms: Math.round(now() - started), slipped: !!slipped });
    if (moves.length === 1) return result(moves[0], 0, 0, 0);

    if (L.slip && rng() < L.slip) {
      const safe = moves.filter(m => !handsOverCrown(st, m));
      const pool = safe.length ? safe : moves;
      return result(pool[Math.floor(rng() * pool.length)], 0, 0, 0, true);
    }

    const budget = opts.budgetMs !== undefined ? opts.budgetMs : L.budgetMs || 0;
    const ctx = {
      rng, noise: L.noise, quiesce: L.quiesce, nodes: 0, ticks: 0, deadline: 0,
      killers: new Int32Array(64), history: Object.create(null)
    };
    // With few pieces left the search is cheap, so look further ahead to finish the game.
    let pieces = 0;
    for (let sq = 0; sq < CELLS; sq++) if (st.owner[sq] !== -1 && st.type[sq] !== CROWN) pieces++;
    // A level with a `shallow` chance sometimes only looks at its own move, bridging the
    // big gap between looking one move ahead and looking two.
    const base = L.shallow && rng() < L.shallow ? 1 : L.depth;
    const depth = base + (base >= 2 ? (pieces <= 4 ? 2 : pieces <= 7 ? 1 : 0) : 0);
    const maxDepth = Math.max(depth, L.maxDepth || 0);
    let best = moves[0], bestScore = 0, done = 0;
    for (let d = 1; d <= maxDepth; d++) {
      // The level's own depth always completes; deeper iterations only run while time remains.
      if (d > depth) {
        if (!budget || now() - started > budget * 0.45) break;
        ctx.deadline = started + budget;
      }
      try {
        const r = searchRoot(ctx, st, moves, d, best);
        best = r.move; bestScore = r.score; done = d;
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break;
      }
      if (Math.abs(bestScore) >= MATE_ZONE) break; // a forced result is already in view
    }
    return result(best, Math.round(bestScore), done, ctx.nodes);
  }

  function levelName(level) {
    const L = LEVELS[Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level | 0))];
    return L ? L.name : '';
  }

  return { chooseMove, evaluate, levelName, makeRng, LEVELS, MIN_LEVEL, MAX_LEVEL, STRESS_LIMIT };
});
