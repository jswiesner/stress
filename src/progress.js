/*
 * Progression: the player's profile and everything that grows it.
 * XP and titles, rival stars, puzzle solves, the daily streak, theme unlocks
 * and achievements. Pure functions over a plain JSON profile, so the rules for
 * rewards are tested in Node and identical in the app.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./rivals.js') : root.StressRivals);
  if (isNode) module.exports = api;
  else root.StressProgress = api;
})(typeof self !== 'undefined' ? self : this, function (Rivals) {
  'use strict';
  const VERSION = 3;

  // ---- levels and titles ----------------------------------------------------
  const TITLES = [[1, 'Rattled'], [3, 'Steady'], [5, 'Composed'], [8, 'Cool-headed'], [12, 'Unflappable'], [16, 'Serene'], [20, 'Zen Master']];
  // XP needed to go from level l to l + 1 grows gently: 100, 150, 200, ...
  const stepFor = l => 100 + 50 * (l - 1);
  function xpForLevel(level) {
    let total = 0;
    for (let l = 1; l < level; l++) total += stepFor(l);
    return total;
  }
  function titleFor(level) {
    let t = TITLES[0][1];
    for (const [min, name] of TITLES) if (level >= min) t = name;
    return t;
  }
  function levelInfo(xp) {
    let level = 1;
    while (xp >= xpForLevel(level + 1)) level++;
    const base = xpForLevel(level);
    return { level, into: xp - base, need: stepFor(level), title: titleFor(level) };
  }

  // ---- dates for the daily puzzle ------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  function dayKey(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  const EPOCH = Date.UTC(2026, 0, 1);
  function dayNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
  }

  // ---- profile ---------------------------------------------------------------
  function newProfile() {
    return {
      v: VERSION,
      xp: 0,
      tutorialDone: false,
      rivals: {}, // id -> { stars, wins, plays }
      puzzles: {}, // id -> { solved, hinted (first solve used a hint), tries (attempts it took), clean (ever solved without a hint) }
      daily: { last: null, streak: 0, best: 0, done: {} }, // done: dayKey -> { moves, hinted }
      stats: { games: 0, wins: 0, crowns: 0, cracks: 0, raids: 0, pvp: 0, tutorials: 0, quickLevel: 3 },
      achievements: {}, // id -> dayKey earned
      theme: 'mist',
      seen: {} // one-time tips
    };
  }

  // Fill in anything missing (older saves, future fields) without losing progress.
  function normalize(p) {
    const base = newProfile();
    if (!p || typeof p !== 'object') return base;
    const out = Object.assign(base, p);
    out.daily = Object.assign(newProfile().daily, p.daily || {});
    out.daily.done = Object.assign({}, (p.daily && p.daily.done) || {});
    out.stats = Object.assign(newProfile().stats, p.stats || {});
    out.rivals = Object.assign({}, p.rivals || {});
    out.puzzles = Object.assign({}, p.puzzles || {});
    // 3.0 saves predate clean-solve badges: a first solve without a hint was clean.
    for (const id in out.puzzles) {
      const rec = out.puzzles[id];
      if (rec && rec.solved && rec.clean === undefined) out.puzzles[id] = Object.assign({}, rec, { clean: !rec.hinted });
    }
    out.achievements = Object.assign({}, p.achievements || {});
    out.seen = Object.assign({}, p.seen || {});
    out.v = VERSION;
    return out;
  }

  const clone = p => JSON.parse(JSON.stringify(p));
  const totalStars = p => Rivals.RIVALS.reduce((n, r) => n + ((p.rivals[r.id] && p.rivals[r.id].stars) || 0), 0);
  const rivalsBeaten = p => Rivals.RIVALS.filter(r => p.rivals[r.id] && p.rivals[r.id].wins > 0).length;
  const solvedCount = p => Object.keys(p.puzzles).filter(id => p.puzzles[id].solved).length;

  // The first rival you haven't beaten yet is the next one up; everything up to it is unlocked.
  function nextRivalIndex(p) {
    for (let i = 0; i < Rivals.RIVALS.length; i++) {
      const r = p.rivals[Rivals.RIVALS[i].id];
      if (!r || !r.wins) return i;
    }
    return Rivals.RIVALS.length - 1;
  }
  const rivalUnlocked = (p, index) => index <= nextRivalIndex(p);

  function streakNow(p, today) {
    if (!p.daily.last) return 0;
    const gap = dayNumber(today || dayKey()) - dayNumber(p.daily.last);
    return gap <= 1 ? p.daily.streak : 0;
  }

  // ---- unlocks ---------------------------------------------------------------
  const THEMES = [
    { id: 'mist', name: 'Mist', need: 'Ready to play', test: () => true },
    { id: 'sakura', name: 'Sakura', need: 'Earn 5 rival stars', test: p => totalStars(p) >= 5 },
    { id: 'matcha', name: 'Matcha', need: 'Solve 10 puzzles', test: p => solvedCount(p) >= 10 },
    { id: 'midnight', name: 'Midnight', need: 'Earn 15 rival stars', test: p => totalStars(p) >= 15 },
    { id: 'sunset', name: 'Sunset', need: 'Reach a 7-day puzzle streak', test: p => p.daily.best >= 7 },
    { id: 'gold', name: 'Gold Leaf', need: 'Beat The Monk', test: p => !!(p.rivals.monk && p.rivals.monk.wins) }
  ];
  const unlockedThemes = p => THEMES.filter(t => t.test(p)).map(t => t.id);

  const ACHIEVEMENTS = [
    { id: 'tutorial', name: 'First steps', text: 'Finish the tutorial.', test: p => p.stats.tutorials > 0 },
    { id: 'raid', name: 'First raid', text: 'Land a raid hit.', test: p => p.stats.raids > 0 },
    { id: 'win', name: 'First win', text: 'Beat a rival.', test: p => rivalsBeaten(p) > 0 },
    { id: 'crown', name: 'Crown snatcher', text: 'Win by capturing a Crown.', test: p => p.stats.crowns > 0 },
    { id: 'crack', name: 'Cracked it', text: 'Win by pushing a rival to 10 Stress.', test: p => p.stats.cracks > 0 },
    { id: 'flawless', name: 'Flawless', text: 'Win without taking any Stress.', test: (p, r) => !!r && r.won && r.versusComputer && r.myStress === 0 },
    { id: 'comeback', name: 'Comeback kid', text: 'Win after reaching 8 Stress.', test: (p, r) => !!r && r.won && r.versusComputer && r.peakStress >= 8 },
    { id: 'triple', name: 'Triple threat', text: 'Hit with three raiders on the same turn.', test: (p, r) => !!r && r.maxRaid >= 3 },
    { id: 'speedy', name: 'Speed run', text: 'Beat a rival in 15 of your moves or fewer.', test: (p, r) => !!r && r.won && r.mode === 'rival' && r.myMoves <= 15 },
    { id: 'halfway', name: 'Halfway up', text: 'Beat five rivals.', test: p => rivalsBeaten(p) >= 5 },
    { id: 'monk', name: 'Unflappable', text: 'Beat The Monk.', test: p => !!(p.rivals.monk && p.rivals.monk.wins) },
    { id: 'stars', name: 'Starry-eyed', text: 'Earn all 30 rival stars.', test: p => totalStars(p) >= 30 },
    { id: 'puzzler', name: 'Puzzler', text: 'Solve 10 puzzles.', test: p => solvedCount(p) >= 10 },
    { id: 'tactician', name: 'Tactician', text: 'Solve 50 puzzles.', test: p => solvedCount(p) >= 50 },
    { id: 'habit', name: 'Daily habit', text: 'Keep a 7-day puzzle streak.', test: p => p.daily.best >= 7 },
    { id: 'persistent', name: 'Never give up', text: 'Solve a puzzle on your fifth try or later.', test: (p, r) => !!r && r.mode === 'puzzle' && r.won && (r.tries || 1) >= 5 },
    { id: 'grandmaster', name: 'Grandmaster', text: 'Solve a win-in-5 puzzle without a hint.', test: (p, r) => !!r && r.mode === 'puzzle' && r.won && (r.puzzleN || 0) >= 5 && !r.hinted },
    { id: 'friends', name: 'Good game', text: 'Finish a two-player game.', test: p => p.stats.pvp > 0 }
  ];

  const starsFor = (won, myStress) => (!won ? 0 : myStress <= 2 ? 3 : myStress <= 5 ? 2 : 1);

  /**
   * Record a finished game or puzzle and work out the rewards.
   * result: { mode: 'rival' | 'quick' | 'pvp' | 'puzzle' | 'tutorial', won, myStress, peakStress,
   *           reason, myMoves, raids, maxRaid, rivalId, puzzleId, puzzleN, daily, hinted, tries, level }
   * Returns { profile, rewards: { xp, before, after, stars, newStars, unlocked, achievements, streak, firstSolve,
   *           tries, newClean } } (tries: the attempt this solve came on; newClean: first solve without a hint).
   */
  function applyResult(profileIn, result, today) {
    const p = normalize(clone(profileIn));
    const before = levelInfo(p.xp);
    const themesBefore = new Set(unlockedThemes(p));
    const rewards = { xp: 0, stars: 0, newStars: 0, unlocked: [], achievements: [], streak: 0, firstSolve: false };
    const day = today || dayKey();
    const r = Object.assign({ versusComputer: result.mode === 'rival' || result.mode === 'quick' }, result);

    if (r.mode === 'rival' || r.mode === 'quick') {
      p.stats.games++;
      if (r.raids) p.stats.raids += r.raids;
      if (r.won) {
        p.stats.wins++;
        if (r.reason === 'crown') p.stats.crowns++;
        if (r.reason === 'stress' || r.reason === 'sudden-death' || r.reason === 'limit') p.stats.cracks++;
      }
    }
    if (r.mode === 'rival') {
      const idx = Rivals.RIVALS.findIndex(x => x.id === r.rivalId);
      const rec = p.rivals[r.rivalId] || { stars: 0, wins: 0, plays: 0 };
      rec.plays++;
      const stars = starsFor(r.won, r.myStress);
      rewards.stars = stars;
      rewards.newStars = Math.max(0, stars - rec.stars);
      if (r.won) rec.wins++;
      rec.stars = Math.max(rec.stars, stars);
      p.rivals[r.rivalId] = rec;
      rewards.xp = r.won ? 40 + 10 * (idx + 1) + 30 * rewards.newStars : 15;
    } else if (r.mode === 'quick') {
      p.stats.quickLevel = r.level || p.stats.quickLevel;
      rewards.xp = r.won ? 40 + 6 * (r.level || 1) : 12;
    } else if (r.mode === 'pvp') {
      p.stats.pvp++;
      rewards.xp = 15;
    } else if (r.mode === 'puzzle') {
      const rec = p.puzzles[r.puzzleId] || {};
      if (r.won) {
        const first = !rec.solved;
        rewards.tries = Math.max(1, r.tries || 1);
        rewards.newClean = !r.hinted && !rec.clean;
        p.puzzles[r.puzzleId] = {
          solved: true,
          hinted: first ? !!r.hinted : !!rec.hinted,
          tries: first ? rewards.tries : rec.tries || rewards.tries,
          clean: !!rec.clean || !r.hinted
        };
        if (first) {
          rewards.firstSolve = true;
          rewards.xp = 20 * (r.puzzleN || 1) + (r.hinted ? 0 : 10);
        }
      }
      if (r.won && r.daily && p.daily.last !== day) {
        const gap = p.daily.last ? dayNumber(day) - dayNumber(p.daily.last) : 99;
        p.daily.streak = gap === 1 ? p.daily.streak + 1 : 1;
        p.daily.best = Math.max(p.daily.best, p.daily.streak);
        p.daily.last = day;
        p.daily.done[day] = { moves: r.myMoves || 0, hinted: !!r.hinted };
        const keys = Object.keys(p.daily.done).sort();
        while (keys.length > 60) delete p.daily.done[keys.shift()];
        rewards.xp += 40;
      }
      rewards.streak = streakNow(p, day);
    } else if (r.mode === 'tutorial') {
      if (!p.stats.tutorials) rewards.xp = 100;
      p.stats.tutorials++;
      p.tutorialDone = true;
    }

    p.xp += rewards.xp;
    const after = levelInfo(p.xp);
    rewards.before = before;
    rewards.after = after;
    rewards.unlocked = unlockedThemes(p).filter(id => !themesBefore.has(id));
    for (const a of ACHIEVEMENTS) {
      if (!p.achievements[a.id] && a.test(p, r)) {
        p.achievements[a.id] = day;
        rewards.achievements.push(a.id);
      }
    }
    return { profile: p, rewards };
  }

  // A failed or restarted attempt at a puzzle not yet solved, so the count survives closing the app.
  function recordTry(profileIn, puzzleId) {
    const p = normalize(clone(profileIn));
    const rec = p.puzzles[puzzleId] || { solved: false, tries: 0 };
    if (!rec.solved) p.puzzles[puzzleId] = Object.assign({}, rec, { solved: false, tries: (rec.tries || 0) + 1 });
    return p;
  }
  // Attempts already spent on a puzzle that isn't solved yet (a solved one starts fresh).
  const triesSoFar = (p, puzzleId) => { const rec = p.puzzles[puzzleId]; return rec && !rec.solved ? rec.tries || 0 : 0; };

  // Packs open in order: each one unlocks after five solves in the pack before it.
  const PACK_UNLOCK = 5;
  const packSolved = (p, pack) => pack.puzzles.filter(z => p.puzzles[z.id] && p.puzzles[z.id].solved).length;
  const packUnlocked = (p, packs, i) => i === 0 || packSolved(p, packs[i - 1]) >= PACK_UNLOCK;

  // The next puzzle to play: the first unsolved one after `fromId` in its pack, then in
  // the following unlocked packs, then from the start. null when everything open is solved.
  function nextPuzzle(p, packs, fromId) {
    const order = [];
    packs.forEach((pack, i) => { if (packUnlocked(p, packs, i)) pack.puzzles.forEach(z => order.push(z)); });
    const at = fromId ? order.findIndex(z => z.id === fromId) : -1;
    const rotated = order.slice(at + 1).concat(order.slice(0, at + 1));
    return rotated.find(z => !(p.puzzles[z.id] && p.puzzles[z.id].solved)) || null;
  }

  // The puzzle shown on a given day, cycling through the whole collection.
  function dailyPuzzleIndex(count, today) {
    const n = dayNumber(today || dayKey());
    return ((n % count) + count) % count;
  }

  return {
    VERSION, TITLES, THEMES, ACHIEVEMENTS,
    levelInfo, xpForLevel, titleFor, dayKey, dayNumber, newProfile, normalize,
    totalStars, rivalsBeaten, solvedCount, nextRivalIndex, rivalUnlocked, streakNow,
    recordTry, triesSoFar, PACK_UNLOCK, packSolved, packUnlocked, nextPuzzle,
    unlockedThemes, starsFor, applyResult, dailyPuzzleIndex
  };
});
