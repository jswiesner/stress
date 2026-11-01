'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/rules.js');
const { LESSONS } = require('../src/tutorial.js').StressTutorial;

const sq = R.squareIndex;
const mv = (a, b) => R.makeMove(sq(a), sq(b));
const start = L => R.fromRows(L.rows, { stress: L.stress, hits: L.hits || {} });

// Play a lesson the way the tutorial does, taking the given target for each taught move.
function playThrough(L, pickTarget) {
  let st = start(L);
  for (const s of L.steps) {
    if (s.select) assert.equal(st.owner[sq(s.select)], R.BLUE, L.id + ': select a Blue piece');
    if (!s.move) continue;
    const [from, targets] = s.move;
    for (const t of targets) assert.ok(R.isLegal(st, mv(from, t)), `${L.id}: ${from}-${t} is legal`);
    st = R.apply(st, mv(from, pickTarget(targets))).state;
    if (s.reply && st.winner === -1) {
      const [a, b] = s.reply.split('-');
      assert.ok(R.isLegal(st, mv(a, b)), `${L.id}: reply ${s.reply} is legal`);
      st = R.apply(st, mv(a, b)).state;
    }
  }
  return st;
}

test('five lessons, each starting with Blue to move and both Crowns on the board', () => {
  assert.deepEqual(LESSONS.map(l => l.id), ['raid', 'nerve', 'capture', 'crack', 'crown']);
  for (const L of LESSONS) {
    const st = start(L);
    assert.equal(st.turn, R.BLUE);
    assert.ok(R.crownSquare(st, R.BLUE) >= 0 && R.crownSquare(st, R.RED) >= 0);
  }
});

test('raid: the Jumper hops in and Red takes 1 Stress at the start of Blue’s turn', () => {
  const st = playThrough(LESSONS[0], t => t[0]);
  assert.equal(st.stress[R.RED], 1);
  assert.equal(R.nerveLeft(st, sq('e5')), 2);
  assert.equal(st.winner, -1);
});

test('nerve: every taught retreat refills the raider and nothing cracks', () => {
  const L = LESSONS[1];
  assert.equal(R.nerveLeft(start(L), sq('e5')), 1);
  for (const target of L.steps[1].move[1]) {
    const st = playThrough(L, () => target);
    assert.equal(st.stress[R.RED], 2, 'no extra hit after retreating to ' + target);
    assert.equal(st.cracks[R.BLUE], 0);
    assert.equal(R.halfOf(sq(target)) === R.RED, false);
  }
});

test('capture: the Guard takes the Runner and then raids for 1', () => {
  const st = playThrough(LESSONS[2], t => t[0]);
  assert.equal(st.captures[R.BLUE], 1);
  assert.equal(st.stress[R.RED], 1);
});

test('crack: g5 is marked risky, c5 is safe, and the raid cracks Red at 10', () => {
  const L = LESSONS[3], st0 = start(L);
  const risky = to => { const w = R.clone(st0); R.play(w, mv('e3', to)); return R.isAttackedBy(w, sq(to), R.RED); };
  assert.ok(risky('g5'));
  assert.ok(!risky('c5'));
  const st = playThrough(L, t => t[0]);
  assert.equal(st.winner, R.BLUE);
  assert.equal(st.reason, 'stress');
});

test('crown: the Jumper captures the Crown and wins at once', () => {
  const st = playThrough(LESSONS[4], t => t[0]);
  assert.equal(st.winner, R.BLUE);
  assert.equal(st.reason, 'crown');
});
