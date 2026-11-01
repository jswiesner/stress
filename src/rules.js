/*
 * Stress 2.0 rules engine.
 *
 * Pure game logic with no DOM access. The same file runs in the page, in the
 * computer opponent's Web Worker (via importScripts) and in Node (tests and the
 * simulator), so every part of the project plays by exactly the same rules.
 *
 * Board: 7x7. Squares are numbered 0..48, index = row * 7 + col.
 * Row 0 is the top (Red's back row), row 6 the bottom (Blue's back row).
 * Square names use files a-g (left to right) and ranks 1-7 (bottom to top).
 *
 * The rules, as printed on the rules card:
 *   1. The three rows nearest you are your half. The middle row is neutral.
 *   2. Each side has a Crown, 2 Guards, 2 Runners and 2 Jumpers.
 *   3. Move one piece per turn. Land on an enemy piece to capture it.
 *   4. Raid: at the start of your turn, each of your pieces in the enemy half
 *      adds 1 to your opponent's Stress.
 *   5. Nerve: a raider can do that 3 times. After its third hit it cracks and
 *      leaves the board. Back in the middle row or your half, its nerve refills.
 *      The Crown never cracks.
 *   6. Win: your opponent reaches 10 Stress, or you capture their Crown.
 *   7. After 40 rounds the player with less Stress wins. If Stress is tied,
 *      play on until someone takes another point.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StressRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 7;
  const CELLS = SIZE * SIZE;
  const BLUE = 0;
  const RED = 1;
  const DRAW = 2;
  const EMPTY = 0;
  const CROWN = 1;
  const GUARD = 2;
  const RUNNER = 3;
  const JUMPER = 4;

  const STRESS_LIMIT = 10;
  const NERVE = 3;
  const ROUND_LIMIT = 40;
  // Safety net only: if sudden death itself drags on this many rounds with no
  // Stress taken, the player with more pieces wins (equal pieces: a draw).
  const SUDDEN_DEATH_ROUNDS = 10;
  const HOME_ROWS = 3;

  const PIECE_NAMES = ['', 'Crown', 'Guard', 'Runner', 'Jumper'];
  const PLAYER_NAMES = ['Blue', 'Red'];
  const FILES = 'abcdefg';
  // Back row, file a to g.
  const BACK_ROW = [GUARD, JUMPER, RUNNER, CROWN, RUNNER, JUMPER, GUARD];

  const rowOf = sq => (sq / SIZE) | 0;
  const colOf = sq => sq % SIZE;
  const onBoard = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  // Which half a square belongs to: BLUE (rows 4-6), RED (rows 0-2) or -1 (the neutral middle row).
  const HALF = new Int8Array(CELLS);
  for (let sq = 0; sq < CELLS; sq++) {
    const r = rowOf(sq);
    HALF[sq] = r >= SIZE - HOME_ROWS ? BLUE : r < HOME_ROWS ? RED : -1;
  }
  const halfOf = sq => HALF[sq];
  const inEnemyHalf = (sq, player) => HALF[sq] === 1 - player;

  // ---- movement tables -------------------------------------------------------
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const KNIGHT = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]];

  function buildRays(dirs, range) {
    const table = [];
    for (let sq = 0; sq < CELLS; sq++) {
      const r = rowOf(sq), c = colOf(sq), out = [];
      for (const [dr, dc] of dirs) {
        const ray = [];
        for (let k = 1; k <= range; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (!onBoard(nr, nc)) break;
          ray.push(nr * SIZE + nc);
        }
        if (ray.length) out.push(ray);
      }
      table.push(out);
    }
    return table;
  }
  function buildLeaps(offsets) {
    const table = [];
    for (let sq = 0; sq < CELLS; sq++) {
      const r = rowOf(sq), c = colOf(sq);
      table.push(offsets.filter(([dr, dc]) => onBoard(r + dr, c + dc)).map(([dr, dc]) => (r + dr) * SIZE + c + dc));
    }
    return table;
  }
  const RAYS = [];
  RAYS[CROWN] = buildRays(ORTHO.concat(DIAG), 1);
  RAYS[GUARD] = buildRays(ORTHO, 2);
  RAYS[RUNNER] = buildRays(DIAG, 2);
  const LEAPS = buildLeaps(KNIGHT);
  const LEAP_HIT = new Uint8Array(CELLS * CELLS);
  LEAPS.forEach((targets, from) => targets.forEach(to => { LEAP_HIT[from * CELLS + to] = 1; }));

  // ---- state -----------------------------------------------------------------
  function emptyState(turn) {
    return {
      type: new Int8Array(CELLS),
      owner: new Int8Array(CELLS).fill(-1),
      hits: new Int8Array(CELLS), // hits a raider has dealt on its current raid (nerve used)
      stress: [0, 0],
      turn: turn,
      first: turn,
      ply: 0,
      winner: -1,
      reason: '',
      suddenDeath: false,
      lastMove: -1,
      quiet: 0, // moves since the last capture or Stress hit
      captures: [0, 0], // pieces each player has captured
      cracks: [0, 0], // each player's own raiders that cracked
      dealt: [0, 0] // Stress each player has dealt
    };
  }

  function newGame(opts) {
    const first = opts && opts.first === RED ? RED : BLUE;
    const st = emptyState(first);
    for (let c = 0; c < SIZE; c++) {
      put(st, c, BACK_ROW[c], RED);
      put(st, (SIZE - 1) * SIZE + c, BACK_ROW[c], BLUE);
    }
    return st;
  }

  function put(st, sq, type, owner) {
    st.type[sq] = type;
    st.owner[sq] = owner;
    st.hits[sq] = 0;
  }

  /**
   * Build a position from 7 strings, top row first. Uppercase letters are Blue,
   * lowercase Red: C/c Crown, G/g Guard, R/r Runner, J/j Jumper, '.' empty.
   * Optional opts: turn, stress [blue, red], hits { e5: 1 }, ply.
   */
  function fromRows(rows, opts) {
    opts = opts || {};
    const st = emptyState(opts.turn === RED ? RED : BLUE);
    const code = { C: CROWN, G: GUARD, R: RUNNER, J: JUMPER };
    if (rows.length !== SIZE) throw new Error('fromRows needs ' + SIZE + ' rows');
    rows.forEach((row, r) => {
      if (row.length !== SIZE) throw new Error('row ' + r + ' must have ' + SIZE + ' squares');
      for (let c = 0; c < SIZE; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        const t = code[ch.toUpperCase()];
        if (!t) throw new Error('unknown piece ' + ch);
        put(st, r * SIZE + c, t, ch === ch.toUpperCase() ? BLUE : RED);
      }
    });
    if (opts.stress) st.stress = opts.stress.slice();
    if (opts.ply) st.ply = opts.ply;
    if (opts.hits) for (const name in opts.hits) st.hits[squareIndex(name)] = opts.hits[name];
    return st;
  }

  function clone(st) {
    return {
      type: st.type.slice(), owner: st.owner.slice(), hits: st.hits.slice(),
      stress: st.stress.slice(), turn: st.turn, first: st.first, ply: st.ply,
      winner: st.winner, reason: st.reason, suddenDeath: st.suddenDeath, lastMove: st.lastMove, quiet: st.quiet,
      captures: st.captures.slice(), cracks: st.cracks.slice(), dealt: st.dealt.slice()
    };
  }

  // Plain JSON-safe copy (for localStorage and messages).
  function serialize(st) {
    return {
      type: Array.from(st.type), owner: Array.from(st.owner), hits: Array.from(st.hits),
      stress: st.stress.slice(), turn: st.turn, first: st.first, ply: st.ply,
      winner: st.winner, reason: st.reason, suddenDeath: st.suddenDeath, lastMove: st.lastMove, quiet: st.quiet,
      captures: st.captures.slice(), cracks: st.cracks.slice(), dealt: st.dealt.slice()
    };
  }
  function deserialize(o) {
    const st = clone({
      type: Int8Array.from(o.type), owner: Int8Array.from(o.owner), hits: Int8Array.from(o.hits),
      stress: o.stress, turn: o.turn, first: o.first, ply: o.ply, winner: o.winner, reason: o.reason,
      suddenDeath: !!o.suddenDeath, lastMove: o.lastMove, quiet: o.quiet | 0,
      captures: o.captures || [0, 0], cracks: o.cracks || [0, 0], dealt: o.dealt || [0, 0]
    });
    return st;
  }

  // ---- moves -----------------------------------------------------------------
  const moveFrom = m => m >> 6;
  const moveTo = m => m & 63;
  const makeMove = (from, to) => from * 64 + to;

  // Squares the piece on `sq` can move to (empty squares and enemy pieces).
  function pieceTargets(st, sq, out) {
    out = out || [];
    const t = st.type[sq], p = st.owner[sq];
    if (p < 0) return out;
    if (t === JUMPER) {
      const leaps = LEAPS[sq];
      for (let i = 0; i < leaps.length; i++) if (st.owner[leaps[i]] !== p) out.push(leaps[i]);
      return out;
    }
    const rays = RAYS[t][sq];
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i];
      for (let k = 0; k < ray.length; k++) {
        const o = st.owner[ray[k]];
        if (o === -1) { out.push(ray[k]); continue; }
        if (o !== p) out.push(ray[k]);
        break;
      }
    }
    return out;
  }

  // All legal moves for the side to move, encoded as from * 64 + to.
  function moves(st) {
    const out = [];
    if (st.winner !== -1) return out;
    const p = st.turn, tmp = [];
    for (let sq = 0; sq < CELLS; sq++) {
      if (st.owner[sq] !== p) continue;
      tmp.length = 0;
      pieceTargets(st, sq, tmp);
      for (let i = 0; i < tmp.length; i++) out.push(sq * 64 + tmp[i]);
    }
    return out;
  }

  function isLegal(st, m) {
    return moves(st).indexOf(m) !== -1;
  }

  // Could the piece on `from` capture on `to` (path clear, whatever stands on `to`)?
  function attacks(st, from, to) {
    const t = st.type[from];
    if (t === JUMPER) return LEAP_HIT[from * CELLS + to] === 1;
    const rays = RAYS[t] && RAYS[t][from];
    if (!rays) return false;
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i];
      for (let k = 0; k < ray.length; k++) {
        if (ray[k] === to) return true;
        if (st.owner[ray[k]] !== -1) break;
      }
    }
    return false;
  }

  function attackersOf(st, sq, player) {
    const out = [];
    for (let f = 0; f < CELLS; f++) if (f !== sq && st.owner[f] === player && attacks(st, f, sq)) out.push(f);
    return out;
  }
  function isAttackedBy(st, sq, player) {
    for (let f = 0; f < CELLS; f++) if (f !== sq && st.owner[f] === player && attacks(st, f, sq)) return true;
    return false;
  }

  function crownSquare(st, player) {
    for (let sq = 0; sq < CELLS; sq++) if (st.owner[sq] === player && st.type[sq] === CROWN) return sq;
    return -1;
  }

  // ---- playing a move ------------------------------------------------------------
  function snapshot(st) {
    return {
      type: st.type.slice(), owner: st.owner.slice(), hits: st.hits.slice(),
      s0: st.stress[0], s1: st.stress[1], turn: st.turn, ply: st.ply, winner: st.winner,
      reason: st.reason, suddenDeath: st.suddenDeath, lastMove: st.lastMove, quiet: st.quiet,
      c0: st.captures[0], c1: st.captures[1], k0: st.cracks[0], k1: st.cracks[1], d0: st.dealt[0], d1: st.dealt[1]
    };
  }

  /**
   * Play move `m` for the side to move, mutating `st`. Applies the capture, then
   * the start of the opponent's turn (their raids and cracks, Stress, wins, the
   * round limit). Returns an undo token for `undo`. When `events` is an array,
   * describes what happened, in order, for the interface to animate.
   * Callers must only pass moves from `moves(st)`.
   */
  function play(st, m, events) {
    const token = snapshot(st);
    const from = m >> 6, to = m & 63, p = st.turn, q = 1 - p;
    const piece = st.type[from], victim = st.type[to], victimOwner = st.owner[to];
    if (events) events.push({ type: 'move', from: from, to: to, player: p, piece: piece });
    st.quiet++;
    if (victimOwner !== -1) {
      st.quiet = 0;
      st.captures[p]++;
      if (events) events.push({ type: 'capture', at: to, player: p, victim: victimOwner, piece: victim });
    }
    st.type[to] = piece;
    st.owner[to] = p;
    st.hits[to] = inEnemyHalf(to, p) ? st.hits[from] : 0; // leaving the enemy half refills nerve
    st.type[from] = EMPTY;
    st.owner[from] = -1;
    st.hits[from] = 0;
    st.ply++;
    st.lastMove = m;
    st.turn = q;
    if (victimOwner !== -1 && victim === CROWN) {
      finish(st, p, 'crown', events);
      return token;
    }
    startTurn(st, events);
    return token;
  }

  // Start of the side-to-move's turn: their raiders hit, tired raiders crack.
  function startTurn(st, events) {
    const q = st.turn, p = 1 - q;
    let dealt = 0;
    for (let sq = 0; sq < CELLS; sq++) {
      if (st.owner[sq] !== q || HALF[sq] !== p) continue;
      dealt++;
      const t = st.type[sq];
      if (t === CROWN) {
        if (events) events.push({ type: 'raid', at: sq, player: q, piece: t, nerveLeft: -1 });
        continue;
      }
      const used = ++st.hits[sq];
      if (events) events.push({ type: 'raid', at: sq, player: q, piece: t, nerveLeft: NERVE - used });
      if (used >= NERVE) {
        st.type[sq] = EMPTY;
        st.owner[sq] = -1;
        st.hits[sq] = 0;
        st.cracks[q]++;
        if (events) events.push({ type: 'crack', at: sq, player: q, piece: t });
      }
    }
    if (dealt) {
      st.quiet = 0;
      st.stress[p] += dealt;
      st.dealt[q] += dealt;
      if (events) events.push({ type: 'stress', player: p, amount: dealt, total: st.stress[p] });
      if (st.stress[p] >= STRESS_LIMIT) return finish(st, q, 'stress', events);
      if (st.suddenDeath) return finish(st, q, 'sudden-death', events);
    }
    if (!st.suddenDeath) {
      if (st.ply >= 2 * ROUND_LIMIT) {
        if (st.stress[BLUE] !== st.stress[RED]) return finish(st, st.stress[BLUE] < st.stress[RED] ? BLUE : RED, 'limit', events);
        st.suddenDeath = true;
        if (events) events.push({ type: 'sudden-death' });
      }
    } else if (st.ply >= 2 * (ROUND_LIMIT + SUDDEN_DEATH_ROUNDS)) {
      const a = pieceCount(st, BLUE), b = pieceCount(st, RED);
      return finish(st, a === b ? DRAW : a > b ? BLUE : RED, a === b ? 'draw' : 'pieces', events);
    }
  }

  function finish(st, winner, reason, events) {
    st.winner = winner;
    st.reason = reason;
    if (events) events.push({ type: 'win', winner: winner, reason: reason });
  }

  function undo(st, token) {
    st.type = token.type; st.owner = token.owner; st.hits = token.hits;
    st.stress[0] = token.s0; st.stress[1] = token.s1;
    st.turn = token.turn; st.ply = token.ply; st.winner = token.winner; st.reason = token.reason;
    st.suddenDeath = token.suddenDeath; st.lastMove = token.lastMove; st.quiet = token.quiet;
    st.captures[0] = token.c0; st.captures[1] = token.c1;
    st.cracks[0] = token.k0; st.cracks[1] = token.k1;
    st.dealt[0] = token.d0; st.dealt[1] = token.d1;
  }

  // A player with no legal move at the start of their turn loses.
  function checkStuck(st, events) {
    if (st.winner === -1 && moves(st).length === 0) finish(st, 1 - st.turn, 'stuck', events);
  }

  /**
   * The full rules for one move, without touching the input:
   * returns { state, events }. Throws on an illegal move.
   */
  function apply(st, m) {
    if (!isLegal(st, m)) throw new Error('Illegal move ' + moveName(m));
    const next = clone(st), events = [];
    play(next, m, events);
    checkStuck(next, events);
    return { state: next, events: events };
  }

  // Ends the game for the player who gives up or runs out of time.
  function forfeit(st, loser, reason) {
    const next = clone(st);
    if (next.winner === -1) finish(next, 1 - loser, reason || 'resign', null);
    return next;
  }

  // ---- queries for the interface -----------------------------------------------
  function pieceCount(st, player) {
    let n = 0;
    for (let sq = 0; sq < CELLS; sq++) if (st.owner[sq] === player && st.type[sq] !== CROWN) n++;
    return n;
  }
  // Stress `player` takes at the start of the opponent's next turn if every enemy raider survives.
  function pendingHits(st, player) {
    let n = 0;
    for (let sq = 0; sq < CELLS; sq++) if (st.owner[sq] === 1 - player && HALF[sq] === player) n++;
    return n;
  }
  // Hits left before the raider on `sq` cracks, or -1 when it isn't a raider (or is a Crown).
  function nerveLeft(st, sq) {
    const p = st.owner[sq];
    if (p < 0 || st.type[sq] === CROWN || !inEnemyHalf(sq, p)) return -1;
    return NERVE - st.hits[sq];
  }
  function round(st) {
    return Math.floor(st.ply / 2) + 1;
  }

  function squareName(sq) { return FILES[colOf(sq)] + (SIZE - rowOf(sq)); }
  function squareIndex(name) { return (SIZE - Number(name.slice(1))) * SIZE + FILES.indexOf(name[0]); }
  function moveName(m) { return squareName(m >> 6) + '-' + squareName(m & 63); }

  return {
    SIZE, CELLS, BLUE, RED, DRAW, EMPTY, CROWN, GUARD, RUNNER, JUMPER,
    STRESS_LIMIT, NERVE, ROUND_LIMIT, SUDDEN_DEATH_ROUNDS, HOME_ROWS,
    PIECE_NAMES, PLAYER_NAMES, BACK_ROW,
    newGame, fromRows, clone, serialize, deserialize,
    moves, isLegal, pieceTargets, attacks, attackersOf, isAttackedBy, crownSquare,
    play, undo, apply, checkStuck, forfeit,
    halfOf, inEnemyHalf, rowOf, colOf, pieceCount, pendingHits, nerveLeft, round,
    moveFrom, moveTo, makeMove, squareName, squareIndex, moveName,
    // movement tables, for the computer opponent's fast evaluation
    tables: { RAYS: RAYS, LEAPS: LEAPS, HALF: HALF }
  };
});
