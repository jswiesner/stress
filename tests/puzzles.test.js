'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/rules.js');
const S = require('../src/solver.js');
const DATA = require('../src/data/puzzles.js');

const all = DATA.packs.flatMap(p => p.puzzles).concat(DATA.daily);
const stateOf = p => R.fromRows(p.rows, { stress: p.stress, hits: p.hits, ply: p.ply });

test('the collection has three packs and a daily set, with unique ids', () => {
  assert.deepEqual(DATA.packs.map(p => [p.id, p.n]), [['warmup', 1], ['tactics', 2], ['mastery', 3]]);
  assert.ok(DATA.daily.length >= 100, 'months of daily puzzles');
  const ids = new Set(all.map(p => p.id));
  assert.equal(ids.size, all.length);
  const positions = new Set(all.map(p => p.rows.join('/') + p.stress));
  assert.equal(positions.size, all.length, 'no repeated positions');
});

test('every puzzle is a legal position with Blue to move and both Crowns on the board', () => {
  for (const p of all) {
    const st = stateOf(p);
    assert.equal(st.turn, R.BLUE, p.id);
    assert.ok(R.crownSquare(st, R.BLUE) >= 0 && R.crownSquare(st, R.RED) >= 0, p.id);
    assert.ok(st.stress[0] < 10 && st.stress[1] < 10, p.id);
    for (const [sq, h] of Object.entries(p.hits)) {
      const i = R.squareIndex(sq);
      assert.ok(st.owner[i] >= 0 && R.inEnemyHalf(i, st.owner[i]) && h > 0 && h < R.NERVE, p.id + ' nerve on ' + sq);
    }
  }
});

test('every puzzle is a forced win in exactly its number of moves, and the stored answer works', () => {
  for (const p of all) {
    const st = stateOf(p);
    assert.equal(S.winDistance(st, p.n, 1e7), p.n, p.id + ' distance');
    const wins = S.winningMoves(st, p.n, 1e7).map(R.moveName);
    assert.ok(wins.includes(p.solution), p.id + ' solution ' + p.solution + ' not in ' + wins);
    assert.ok(wins.length <= 2, p.id + ' should have a clear answer');
  }
});

test('the defender always has a reply, and the solver finds the most stubborn one', () => {
  const p = DATA.packs[1].puzzles[0];
  let st = R.apply(stateOf(p), R.makeMove(R.squareIndex(p.solution.slice(0, 2)), R.squareIndex(p.solution.slice(3)))).state;
  assert.equal(st.winner, -1);
  const d = S.bestDefense(st, 1, 1e7);
  assert.ok(!d.escapes, 'the solution leaves no escape');
  assert.equal(d.movesLeft, 1);
  st = R.apply(st, d.move).state;
  assert.equal(S.winDistance(st, 1, 1e7), 1);
});

test('after the right move, no defense escapes, for Stress finishes and Crown finishes alike', () => {
  for (const p of all.filter(z => z.n >= 2).slice(0, 80)) {
    const st = stateOf(p);
    const [a, b] = p.solution.split('-');
    const after = R.apply(st, R.makeMove(R.squareIndex(a), R.squareIndex(b))).state;
    if (after.winner === R.BLUE) continue;
    const d = S.bestDefense(after, p.n - 1, 1e7);
    assert.ok(!d.escapes, p.id + ' (' + p.ends + ') should hold after ' + p.solution);
    assert.ok(d.movesLeft >= 0 && d.movesLeft <= p.n - 1, p.id);
  }
});

test('a wrong first move lets the defender off the hook', () => {
  const p = DATA.packs[2].puzzles[0];
  const st = stateOf(p);
  const wins = new Set(S.winningMoves(st, p.n, 1e7));
  const wrong = R.moves(st).find(m => !wins.has(m));
  const after = R.apply(st, wrong).state;
  if (after.winner === -1) assert.ok(S.bestDefense(after, p.n - 1, 1e7).escapes || S.winDistance(after, p.n, 1e7) !== p.n - 1);
});
