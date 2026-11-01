'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/progress.js');
const Rivals = require('../src/rivals.js');

const win = (rivalId, myStress, extra) => Object.assign({ mode: 'rival', rivalId, won: true, myStress, peakStress: myStress, reason: 'stress', myMoves: 20, raids: 3, maxRaid: 1 }, extra || {});
const loss = (rivalId) => ({ mode: 'rival', rivalId, won: false, myStress: 10, peakStress: 10, reason: 'stress', myMoves: 20, raids: 1, maxRaid: 1 });

test('levels grow gently and carry titles', () => {
  assert.deepEqual(P.levelInfo(0), { level: 1, into: 0, need: 100, title: 'Rattled' });
  assert.equal(P.levelInfo(99).level, 1);
  assert.equal(P.levelInfo(100).level, 2);
  assert.equal(P.levelInfo(250).level, 3);
  assert.equal(P.levelInfo(250).title, 'Steady');
  assert.equal(P.titleFor(20), 'Zen Master');
  for (let l = 1; l < 30; l++) assert.ok(P.xpForLevel(l + 1) > P.xpForLevel(l));
});

test('stars: one for a win, two at 5 Stress or less, three at 2 or less', () => {
  assert.equal(P.starsFor(false, 0), 0);
  assert.equal(P.starsFor(true, 9), 1);
  assert.equal(P.starsFor(true, 5), 2);
  assert.equal(P.starsFor(true, 2), 3);
});

test('beating a rival unlocks the next one, best stars are kept, XP only for new stars', () => {
  let p = P.newProfile();
  assert.equal(P.nextRivalIndex(p), 0);
  assert.ok(!P.rivalUnlocked(p, 1));
  let res = P.applyResult(p, loss('pip'));
  assert.equal(res.rewards.xp, 15);
  assert.equal(P.nextRivalIndex(res.profile), 0, 'a loss unlocks nothing');
  res = P.applyResult(res.profile, win('pip', 7));
  assert.equal(res.rewards.stars, 1);
  assert.equal(res.rewards.newStars, 1);
  assert.equal(res.rewards.xp, 40 + 10 + 30);
  assert.equal(P.nextRivalIndex(res.profile), 1);
  assert.ok(P.rivalUnlocked(res.profile, 1));
  const again = P.applyResult(res.profile, win('pip', 9));
  assert.equal(again.rewards.newStars, 0);
  assert.equal(again.profile.rivals.pip.stars, 1, 'stars never go down');
  const better = P.applyResult(again.profile, win('pip', 1));
  assert.equal(better.rewards.newStars, 2);
  assert.equal(better.profile.rivals.pip.stars, 3);
});

test('themes unlock from stars, puzzles, streaks and the final rival', () => {
  let p = P.newProfile();
  assert.deepEqual(P.unlockedThemes(p), ['mist']);
  let res = P.applyResult(p, win('pip', 0));
  res = P.applyResult(res.profile, win('bramble', 4));
  assert.deepEqual(res.rewards.unlocked, ['sakura'], '3 + 2 stars');
  p = res.profile;
  for (let i = 0; i < 10; i++) p = P.applyResult(p, { mode: 'puzzle', puzzleId: 'p' + i, puzzleN: 1, won: true }).profile;
  assert.ok(P.unlockedThemes(p).includes('matcha'));
  p.rivals.monk = { stars: 1, wins: 1, plays: 1 };
  assert.ok(P.unlockedThemes(p).includes('gold'));
});

test('achievements fire once, from profile totals or from a single game', () => {
  let res = P.applyResult(P.newProfile(), win('pip', 0, { reason: 'crown', maxRaid: 3, myMoves: 12 }));
  for (const id of ['raid', 'win', 'crown', 'flawless', 'triple', 'speedy']) assert.ok(res.rewards.achievements.includes(id), id);
  assert.ok(!res.rewards.achievements.includes('crack'));
  const again = P.applyResult(res.profile, win('pip', 0, { reason: 'crown' }));
  assert.ok(!again.rewards.achievements.includes('flawless'), 'already earned');
  const comeback = P.applyResult(again.profile, win('bramble', 6, { peakStress: 9 }));
  assert.ok(comeback.rewards.achievements.includes('comeback'));
  assert.ok(comeback.rewards.achievements.includes('crack'));
  const pvp = P.applyResult(P.newProfile(), { mode: 'pvp', won: true });
  assert.deepEqual(pvp.rewards.achievements, ['friends']);
});

test('puzzles pay XP once; the daily adds a streak that survives one day and resets after a gap', () => {
  let p = P.newProfile();
  let res = P.applyResult(p, { mode: 'puzzle', puzzleId: 'a', puzzleN: 2, won: true, daily: true }, '2026-03-01');
  assert.equal(res.rewards.xp, 20 * 2 + 10 + 40);
  assert.equal(res.rewards.streak, 1);
  res = P.applyResult(res.profile, { mode: 'puzzle', puzzleId: 'a', puzzleN: 2, won: true, daily: true }, '2026-03-01');
  assert.equal(res.rewards.xp, 0, 'same puzzle, same day');
  res = P.applyResult(res.profile, { mode: 'puzzle', puzzleId: 'b', puzzleN: 1, won: true, daily: true, hinted: true }, '2026-03-02');
  assert.equal(res.rewards.streak, 2);
  assert.equal(res.rewards.xp, 20 + 40, 'no hint bonus when hinted');
  assert.equal(P.streakNow(res.profile, '2026-03-03'), 2, 'still alive the next day');
  assert.equal(P.streakNow(res.profile, '2026-03-04'), 0, 'broken after a missed day');
  res = P.applyResult(res.profile, { mode: 'puzzle', puzzleId: 'c', puzzleN: 1, won: true, daily: true }, '2026-03-05');
  assert.equal(res.rewards.streak, 1);
  assert.equal(res.profile.daily.best, 2);
});

test('a seven-day streak unlocks Sunset and Daily habit', () => {
  let p = P.newProfile();
  let res;
  for (let d = 1; d <= 7; d++) {
    res = P.applyResult(p, { mode: 'puzzle', puzzleId: 'd' + d, puzzleN: 1, won: true, daily: true }, '2026-04-0' + d);
    p = res.profile;
  }
  assert.equal(p.daily.streak, 7);
  assert.ok(res.rewards.unlocked.includes('sunset'));
  assert.ok(res.rewards.achievements.includes('habit'));
});

test('day numbers count calendar days, across months and years', () => {
  assert.equal(P.dayNumber('2026-01-01'), 0);
  assert.equal(P.dayNumber('2026-03-01') - P.dayNumber('2026-02-28'), 1);
  assert.equal(P.dayNumber('2027-01-01') - P.dayNumber('2026-12-31'), 1);
  assert.match(P.dayKey(new Date(2026, 9, 31)), /^2026-10-31$/);
  const seen = new Set();
  for (let d = 0; d < 40; d++) seen.add(P.dailyPuzzleIndex(40, '2026-02-' + String(1 + (d % 28)).padStart(2, '0')));
  assert.ok([...seen].every(i => i >= 0 && i < 40));
});

test('skipping the tutorial does not earn its award later', () => {
  const p = P.newProfile();
  p.tutorialDone = true; // skipped
  const res = P.applyResult(p, win('pip', 4));
  assert.ok(!res.rewards.achievements.includes('tutorial'));
});

test('tutorial XP is a one-time welcome', () => {
  const first = P.applyResult(P.newProfile(), { mode: 'tutorial', won: true });
  assert.equal(first.rewards.xp, 100);
  assert.ok(first.rewards.achievements.includes('tutorial'));
  assert.equal(P.applyResult(first.profile, { mode: 'tutorial', won: true }).rewards.xp, 0);
});

test('old or partial saves are filled in without losing progress', () => {
  const p = P.normalize({ xp: 420, rivals: { pip: { stars: 2, wins: 1, plays: 3 } }, daily: { streak: 3 } });
  assert.equal(p.xp, 420);
  assert.equal(p.rivals.pip.stars, 2);
  assert.equal(p.daily.streak, 3);
  assert.deepEqual(p.daily.done, {});
  assert.equal(p.stats.games, 0);
  assert.equal(P.normalize(null).xp, 0);
  assert.equal(Rivals.RIVALS.length * 3, 30, 'thirty stars on the ladder');
});
