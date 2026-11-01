'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/rules.js');

const sq = R.squareIndex;
const mv = (a, b) => R.makeMove(sq(a), sq(b));
const targetsOf = (st, name) => R.pieceTargets(st, sq(name)).map(R.squareName).sort();
const names = list => list.slice().sort();

test('new game: back rows, crowns, Blue moves first by default', () => {
  const st = R.newGame();
  assert.equal(st.turn, R.BLUE);
  const row = r => Array.from({ length: 7 }, (_, c) => st.type[r * 7 + c]);
  assert.deepEqual(row(0), R.BACK_ROW);
  assert.deepEqual(row(6), R.BACK_ROW);
  assert.equal(R.squareName(R.crownSquare(st, R.BLUE)), 'd1');
  assert.equal(R.squareName(R.crownSquare(st, R.RED)), 'd7');
  assert.equal(R.pieceCount(st, R.BLUE), 6);
  assert.equal(R.newGame({ first: R.RED }).turn, R.RED);
});

test('opening position has 21 legal moves', () => {
  // 2 Guards x 2 + 2 Jumpers x 3 + 2 Runners x 4 + Crown x 3
  assert.equal(R.moves(R.newGame()).length, 21);
});

test('halves: three rows each, middle row neutral', () => {
  assert.equal(R.halfOf(sq('a1')), R.BLUE);
  assert.equal(R.halfOf(sq('g3')), R.BLUE);
  assert.equal(R.halfOf(sq('d4')), -1);
  assert.equal(R.halfOf(sq('a5')), R.RED);
  assert.equal(R.halfOf(sq('g7')), R.RED);
  assert.ok(R.inEnemyHalf(sq('e5'), R.BLUE));
  assert.ok(!R.inEnemyHalf(sq('e4'), R.BLUE));
  assert.ok(R.inEnemyHalf(sq('b3'), R.RED));
});

test('Guard moves 1-2 straight, stops at pieces, captures enemies', () => {
  const st = R.fromRows([
    '.......',
    '.......',
    '...g...',
    '.......',
    '.G.G...',
    '.......',
    '.......'
  ]);
  // d3 Guard: up d4 then d5 is enemy (capture); left c3 then b3 own (blocked); right e3, f3; down d2, d1
  assert.deepEqual(targetsOf(st, 'd3'), names(['d4', 'd5', 'c3', 'e3', 'f3', 'd2', 'd1']));
});

test('Runner moves 1-2 diagonally and cannot jump', () => {
  const st = R.fromRows([
    '.......',
    '.......',
    '.......',
    '....G..',
    '...R...',
    '.......',
    '.......'
  ]);
  // d3 Runner: e4 is a friendly Guard so the up-right diagonal is blocked
  assert.deepEqual(targetsOf(st, 'd3'), names(['c4', 'b5', 'c2', 'b1', 'e2', 'f1']));
});

test('Jumper moves in an L and hops over pieces', () => {
  const st = R.fromRows([
    '.......',
    '.......',
    '.......',
    '...G...',
    '..GJG..',
    '...G...',
    '.......'
  ]);
  assert.deepEqual(targetsOf(st, 'd3'), names(['c5', 'e5', 'b4', 'f4', 'b2', 'f2', 'c1', 'e1']));
});

test('Crown moves one square in any direction', () => {
  const st = R.fromRows(['.......', '.......', '.......', '.......', '.......', '.......', 'C......']);
  assert.deepEqual(targetsOf(st, 'a1'), names(['a2', 'b2', 'b1']));
});

test('a raider hits at the start of its owner\'s next turn, not when it arrives', () => {
  let st = R.fromRows([
    '...c...',
    '.......',
    '.......',
    '..J....',
    '.......',
    '.......',
    '...C...'
  ]);
  st = R.apply(st, mv('c4', 'd6')).state; // Blue raids
  assert.equal(st.stress[R.RED], 0, 'no Stress on arrival');
  assert.equal(R.pendingHits(st, R.RED), 1, 'Red sees the hit coming');
  const res = R.apply(st, mv('d7', 'c7')); // Red does nothing about it
  st = res.state;
  assert.equal(st.stress[R.RED], 1);
  assert.equal(R.nerveLeft(st, sq('d6')), 2);
  const raid = res.events.find(e => e.type === 'raid');
  assert.equal(R.squareName(raid.at), 'd6');
  assert.equal(raid.nerveLeft, 2);
  assert.deepEqual(res.events.find(e => e.type === 'stress'), { type: 'stress', player: R.RED, amount: 1, total: 1 });
});

test('nerve: a raider cracks right after its third hit', () => {
  let st = R.fromRows([
    'c......',
    '.......',
    '....J..',
    '.......',
    '.......',
    '.......',
    '...C..G'
  ], { hits: { e5: 0 }, turn: R.RED });
  // Red shuffles its Crown, Blue shuffles its Guard; the Jumper stays put
  const shuffle = [mv('a7', 'b7'), mv('g1', 'g2'), mv('b7', 'a7'), mv('g2', 'g1'), mv('a7', 'b7')];
  const seen = [];
  for (const m of shuffle) {
    const res = R.apply(st, m);
    st = res.state;
    for (const e of res.events) if (e.type === 'raid' || e.type === 'crack') seen.push(e.type + ':' + (e.nerveLeft === undefined ? '' : e.nerveLeft));
  }
  assert.deepEqual(seen, ['raid:2', 'raid:1', 'raid:0', 'crack:']);
  assert.equal(st.stress[R.RED], 3);
  assert.equal(st.owner[sq('e5')], -1, 'the Jumper is gone');
  assert.equal(st.cracks[R.BLUE], 1);
});

test('nerve refills once a raider steps back out', () => {
  let st = R.fromRows([
    'c......',
    '.......',
    '....J..',
    '.......',
    '.......',
    '.......',
    '...C...'
  ], { hits: { e5: 2 } });
  assert.equal(R.nerveLeft(st, sq('e5')), 1);
  st = R.apply(st, mv('e5', 'd3')).state; // back into Blue's own half
  assert.equal(st.hits[sq('d3')], 0);
  st = R.apply(st, mv('a7', 'b7')).state;
  st = R.apply(st, mv('d3', 'e5')).state; // and in again
  assert.equal(R.nerveLeft(st, sq('e5')), 3);
});

test('nerve carries over while a raider moves around inside the enemy half', () => {
  let st = R.fromRows([
    'c......',
    '.......',
    '....J..',
    '.......',
    '.......',
    '.......',
    '...C...'
  ], { hits: { e5: 1 } });
  st = R.apply(st, mv('e5', 'f7')).state;
  assert.equal(st.hits[sq('f7')], 1);
});

test('the Crown raids too and never cracks', () => {
  let st = R.fromRows([
    'c......',
    '.......',
    '.......',
    '...C...',
    '.......',
    '.......',
    'G......'
  ]);
  st = R.apply(st, mv('d4', 'd5')).state;
  for (let i = 0; i < 4; i++) {
    st = R.apply(st, i % 2 ? mv('b7', 'a7') : mv('a7', 'b7')).state;
    st = R.apply(st, i % 2 ? mv('a2', 'a1') : mv('a1', 'a2')).state;
  }
  st = R.apply(st, mv('a7', 'b7')).state;
  assert.equal(st.stress[R.RED], 5);
  assert.equal(st.type[sq('d5')], R.CROWN);
  assert.equal(R.nerveLeft(st, sq('d5')), -1);
});

test('reaching 10 Stress ends the game before the raider\'s owner moves', () => {
  let st = R.fromRows([
    'c......',
    '.......',
    '.J.J...',
    '.......',
    '.......',
    '.......',
    '...C...'
  ], { stress: [0, 8], turn: R.RED });
  const res = R.apply(st, mv('a7', 'b7'));
  assert.equal(res.state.winner, R.BLUE);
  assert.equal(res.state.reason, 'stress');
  assert.equal(res.state.stress[R.RED], 10);
  assert.deepEqual(res.events.at(-1), { type: 'win', winner: R.BLUE, reason: 'stress' });
  assert.equal(R.moves(res.state).length, 0, 'no moves after the game ends');
});

test('capturing the Crown wins at once', () => {
  const st = R.fromRows([
    '.......',
    '.......',
    '.......',
    '...c...',
    '.......',
    '...G...',
    '...C...'
  ]);
  const res = R.apply(st, mv('d2', 'd4'));
  assert.equal(res.state.winner, R.BLUE);
  assert.equal(res.state.reason, 'crown');
  assert.equal(res.state.captures[R.BLUE], 1);
});

test('round limit: less Stress wins after 40 rounds', () => {
  let st = R.fromRows([
    'c......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '......C'
  ], { stress: [3, 5], ply: 79, turn: R.RED });
  const res = R.apply(st, mv('a7', 'b7'));
  assert.equal(res.state.winner, R.BLUE);
  assert.equal(res.state.reason, 'limit');
});

test('round limit: tied Stress goes to sudden death', () => {
  let st = R.fromRows([
    'c......',
    '.......',
    '.......',
    '.......',
    '...J...',
    '.......',
    '......C'
  ], { stress: [4, 4], ply: 79, turn: R.RED });
  let res = R.apply(st, mv('a7', 'b7'));
  assert.equal(res.state.winner, -1);
  assert.ok(res.state.suddenDeath);
  assert.ok(res.events.some(e => e.type === 'sudden-death'));
  st = R.apply(res.state, mv('d3', 'c5')).state; // Blue raids
  res = R.apply(st, mv('b7', 'a7')); // the raider survives: Red takes the next point
  assert.equal(res.state.winner, R.BLUE);
  assert.equal(res.state.reason, 'sudden-death');
});

test('sudden death cannot run forever', () => {
  const st = R.fromRows([
    'c......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    'G.....C'
  ], { stress: [4, 4], ply: 2 * (R.ROUND_LIMIT + R.SUDDEN_DEATH_ROUNDS) - 1, turn: R.RED });
  st.suddenDeath = true;
  const res = R.apply(st, mv('a7', 'b7'));
  assert.equal(res.state.winner, R.BLUE);
  assert.equal(res.state.reason, 'pieces');
});

test('a player with no legal moves loses', () => {
  const st = R.fromRows(Array(7).fill('GGGGGGG'));
  st.type[sq('a1')] = R.CROWN;
  R.checkStuck(st);
  assert.equal(st.winner, R.RED);
  assert.equal(st.reason, 'stuck');
});

test('apply rejects illegal moves and never mutates its input', () => {
  const st = R.newGame();
  const before = JSON.stringify(R.serialize(st));
  assert.throws(() => R.apply(st, mv('a1', 'a5')), /Illegal/);
  R.apply(st, mv('b1', 'c3'));
  assert.equal(JSON.stringify(R.serialize(st)), before);
});

test('forfeit hands the win to the other player', () => {
  const st = R.forfeit(R.newGame(), R.BLUE, 'time');
  assert.equal(st.winner, R.RED);
  assert.equal(st.reason, 'time');
});

test('play/undo and serialize/deserialize round-trip through random games', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let g = 0; g < 30; g++) {
    let st = R.newGame({ first: g % 2 });
    while (st.winner === -1) {
      const ms = R.moves(st);
      const m = ms[Math.floor(rand() * ms.length)];
      const before = JSON.stringify(R.serialize(st));
      const token = R.play(st, m);
      R.undo(st, token);
      assert.equal(JSON.stringify(R.serialize(st)), before);
      st = R.apply(st, m).state;
      assert.equal(JSON.stringify(R.serialize(R.deserialize(JSON.parse(JSON.stringify(R.serialize(st)))))), JSON.stringify(R.serialize(st)));
    }
    assert.ok([R.BLUE, R.RED, R.DRAW].includes(st.winner));
    assert.ok(st.ply <= 2 * (R.ROUND_LIMIT + R.SUDDEN_DEATH_ROUNDS));
  }
});

test('attack queries agree with move generation', () => {
  let st = R.newGame();
  let seed = 3;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 40 && st.winner === -1; i++) {
    for (let from = 0; from < R.CELLS; from++) {
      if (st.owner[from] < 0) continue;
      const targets = new Set(R.pieceTargets(st, from));
      for (let to = 0; to < R.CELLS; to++) {
        if (st.owner[to] >= 0 && st.owner[to] !== st.owner[from]) assert.equal(R.attacks(st, from, to), targets.has(to));
      }
    }
    const ms = R.moves(st);
    st = R.apply(st, ms[Math.floor(rand() * ms.length)]).state;
  }
});
