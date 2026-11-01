'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/rules.js');
const AI = require('../src/ai.js');

const sq = R.squareIndex;
const mv = (a, b) => R.makeMove(sq(a), sq(b));

function randomPositions(count, seed) {
  const rng = AI.makeRng(seed), out = [];
  for (let g = 0; out.length < count; g++) {
    let st = R.newGame({ first: g % 2 });
    const length = 4 + Math.floor(rng() * 40);
    for (let i = 0; i < length && st.winner === -1; i++) {
      const ms = R.moves(st);
      st = R.apply(st, ms[Math.floor(rng() * ms.length)]).state;
    }
    if (st.winner === -1) out.push(st);
  }
  return out;
}

test('every level returns a legal move and leaves the input untouched', () => {
  for (const st of randomPositions(12, 11)) {
    const before = JSON.stringify(R.serialize(st));
    for (let level = AI.MIN_LEVEL; level <= AI.MAX_LEVEL; level++) {
      const r = AI.chooseMove(st, { level, seed: level, budgetMs: 40 });
      assert.ok(R.isLegal(st, r.move), `level ${level} played ${R.moveName(r.move)}`);
    }
    assert.equal(JSON.stringify(R.serialize(st)), before);
  }
});

test('levels 4-9 take a Crown that is there for the taking', () => {
  const st = R.fromRows([
    '...c...',
    '.......',
    '...G...',
    '.......',
    '.......',
    '.......',
    'C......'
  ]);
  for (let level = 4; level <= 9; level++) {
    for (let seed = 0; seed < 5; seed++) {
      const r = AI.chooseMove(st, { level, seed, budgetMs: 60 });
      assert.equal(R.moveName(r.move), 'd5-d7', `level ${level}`);
    }
  }
});

test('no level, slipping or not, hands over its own Crown when it has a choice', () => {
  // Red's Crown on d7 is safe where it stands; stepping to c6 or e6 would walk into Blue's Guard.
  const st = R.fromRows([
    '...c..g',
    '.......',
    '.......',
    '..G.G..',
    '.......',
    '.......',
    'C......'
  ], { turn: R.RED });
  for (let level = AI.MIN_LEVEL; level <= AI.MAX_LEVEL; level++) {
    for (let seed = 0; seed < 25; seed++) {
      const r = AI.chooseMove(st, { level, seed, budgetMs: 30 });
      const next = R.apply(st, r.move).state;
      const crown = R.crownSquare(next, R.RED);
      assert.ok(!R.isAttackedBy(next, crown, R.BLUE), `level ${level} seed ${seed} played ${R.moveName(r.move)}`);
    }
  }
});

test('levels 4-9 capture a raider that would otherwise finish them', () => {
  // Blue is on 9 Stress; Red's Jumper on c3 will hit at the start of Red's turn unless
  // Blue's Guard on c1 takes it.
  const st = R.fromRows([
    '...c...',
    '.......',
    '.......',
    '.......',
    '..j....',
    '.......',
    '..G.C..'
  ], { stress: [9, 0] });
  for (let level = 4; level <= 9; level++) {
    const r = AI.chooseMove(st, { level, seed: 1, budgetMs: 60 });
    assert.equal(R.squareName(R.moveTo(r.move)), 'c3', `level ${level} played ${R.moveName(r.move)}`);
  }
});

test('the same seed gives the same move', () => {
  const [st] = randomPositions(1, 5);
  for (const level of [1, 5, 8]) {
    const a = AI.chooseMove(st, { level, seed: 99 }), b = AI.chooseMove(st, { level, seed: 99 });
    assert.equal(a.move, b.move);
  }
});

test('level 9 keeps to its time budget', () => {
  const [st] = randomPositions(1, 21);
  const r = AI.chooseMove(st, { level: 9, seed: 3, budgetMs: 120 });
  assert.ok(r.ms < 400, `took ${r.ms} ms`);
  assert.ok(r.depth >= 4, 'always completes its minimum depth');
});

test('returns null when there is nothing to play', () => {
  const st = R.newGame();
  st.winner = R.RED;
  assert.equal(AI.chooseMove(st, { level: 5 }), null);
});

test('level names follow the difficulty bands', () => {
  assert.equal(AI.levelName(1), 'Chill');
  assert.equal(AI.levelName(5), 'Steady');
  assert.equal(AI.levelName(8), 'Sharp');
  assert.equal(AI.levelName(9), 'Ruthless');
  assert.equal(AI.levelName(42), 'Ruthless');
});
