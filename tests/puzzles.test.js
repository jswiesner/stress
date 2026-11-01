'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/rules.js');
const S = require('../src/solver.js');
const DATA = require('../src/data/puzzles.js');

const crypto = require('crypto');
const all = DATA.packs.flatMap(p => p.puzzles).concat(DATA.daily);
const shallow = all.filter(p => p.n <= 3);
const deep = all.filter(p => p.n >= 4);
const stateOf = p => R.fromRows(p.rows, { stress: p.stress, hits: p.hits, ply: p.ply });
const parse = name => R.makeMove(R.squareIndex(name.slice(0, 2)), R.squareIndex(name.slice(3)));
// Full proofs of every 4- and 5-move puzzle take many minutes; STRESS_PROVE_ALL=1 runs them all.
const PROVE_ALL = process.env.STRESS_PROVE_ALL === '1';
const sample = list => (PROVE_ALL ? list : [list[0], list[Math.floor(list.length / 2)], list[list.length - 1]]);

test('the collection has five packs and a daily set, with unique ids', () => {
  assert.deepEqual(DATA.packs.map(p => [p.id, p.n]), [['warmup', 1], ['tactics', 2], ['mastery', 3], ['expert', 4], ['grandmaster', 5]]);
  for (const pack of DATA.packs) assert.ok(pack.puzzles.length >= 40, pack.id + ' has a real pack of puzzles');
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

test('shipped puzzles never change under players: same ids, same positions, same daily rotation', () => {
  // Fingerprints of the 3.0 collection. Packs may be reordered; ids must keep their positions.
  const fp = list => crypto.createHash('sha256').update(list.map(z => z.id + ':' + z.rows.join('/') + ':' + z.stress + ':' + JSON.stringify(z.hits) + ':' + z.ply + ':' + z.solution).join('|')).digest('hex').slice(0, 16);
  const byId = list => list.slice().sort((a, b) => a.id.localeCompare(b.id));
  const pack = id => DATA.packs.find(p => p.id === id).puzzles;
  assert.equal(fp(byId(pack('warmup'))), '29742497c553806d');
  assert.equal(fp(byId(pack('tactics'))), 'ffd246bb2f5b7766');
  assert.equal(fp(byId(pack('mastery'))), '6c8d2d99c41eba0a');
  assert.equal(fp(DATA.daily), '6441215353098045', 'the daily rotation is in its original order');
});

test('every puzzle up to 3 moves is a forced win in exactly its number of moves, and the stored answer works', () => {
  for (const p of shallow) {
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
  for (const p of shallow.filter(z => z.n >= 2).slice(0, 80)) {
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

test('every 4- and 5-move puzzle replays its stored line to a win in exactly its number of moves', () => {
  for (const p of deep) {
    assert.equal(p.solution, p.line[0], p.id);
    assert.equal(p.duals.length, p.n, p.id + ' a count of winning moves for each of your turns');
    assert.equal(p.duals[0], 1, p.id + ' one winning first move');
    let st = stateOf(p), mine = 0;
    for (const name of p.line) {
      const m = parse(name);
      assert.ok(R.isLegal(st, m), p.id + ' legal ' + name);
      if (st.turn === R.BLUE) mine++;
      st = R.apply(st, m).state;
      if (st.winner !== -1) break;
    }
    assert.equal(st.winner, R.BLUE, p.id + ' the line wins');
    assert.equal(mine, p.n, p.id + ' in exactly ' + p.n + ' moves');
    assert.equal(st.reason, p.ends, p.id);
    // Turns too deep for a phone to check carry every other winning move with its reply.
    for (let step = 0; step < p.n; step++) {
      if (p.n - step - 1 > 2 && p.duals[step] > 1) assert.ok(p.alts && p.alts[step] && Object.keys(p.alts[step]).length >= 1, p.id + ' alternatives at turn ' + (step + 1));
    }
  }
});

test('a sample of 4- and 5-move puzzles is proven exactly: no shorter win, one winning first move', () => {
  for (const pack of DATA.packs.filter(z => z.n >= 4)) {
    for (const p of sample(pack.puzzles)) {
      const st = stateOf(p);
      assert.equal(S.winDistance(st, p.n - 1, 5e7), 0, p.id + ' has no shorter win');
      assert.equal(S.forcedWin(st, p.n, 5e7), true, p.id + ' is a forced win');
      assert.deepEqual(S.winningMoves(st, p.n, 8e7).map(R.moveName), [p.solution], p.id + ' only the first move wins');
    }
  }
});

test('stored alternatives really win, and their replies are the toughest defense', () => {
  const withAlts = deep.filter(p => p.alts && Object.values(p.alts).some(a => Object.keys(a).length));
  for (const p of PROVE_ALL ? withAlts : withAlts.slice(0, 2)) {
    for (const [step, known] of Object.entries(p.alts)) {
      let st = stateOf(p);
      for (let i = 0; i < 2 * step; i++) st = R.apply(st, parse(p.line[i])).state;
      const left = p.n - step;
      for (const [move, reply] of Object.entries(known)) {
        const after = R.apply(st, parse(move)).state;
        const d = S.bestDefense(after, left - 1, 5e7);
        assert.ok(d && !d.escapes, p.id + ' ' + move + ' wins');
        assert.equal(R.moveName(d.move), reply, p.id + ' reply to ' + move);
      }
    }
  }
});
