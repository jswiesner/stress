/* Settings, progress and the game in progress, kept in this browser's localStorage.
   Every read and write is guarded: private windows and blocked storage just mean
   nothing is remembered, never a broken page. */
(function (root) {
  'use strict';
  const PREFIX = 'stress2.';

  const DEFAULT_SETTINGS = {
    sound: true,
    hints: true,
    theme: 'auto', // auto | light | dark
    levelMode: 'adaptive', // adaptive | fixed
    fixedLevel: 5,
    clock: 0 // two-player clock in seconds per player; 0 = off
  };
  const DEFAULT_PROGRESS = {
    level: 3, // adaptive level, 1-9
    played: 0,
    won: 0,
    streak: 0,
    bestStreak: 0,
    nextFirst: { ai: 0, pvp: 0 }, // who opens the next game (0 Blue, 1 Red)
    coach: {} // first-game tips already shown
  };

  function read(key) {
    try {
      const raw = root.localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function write(key, value) {
    try {
      if (value === null) root.localStorage.removeItem(PREFIX + key);
      else root.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: keep playing without it */ }
  }

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS, read('settings') || {});
    s.fixedLevel = Math.max(1, Math.min(9, s.fixedLevel | 0 || DEFAULT_SETTINGS.fixedLevel));
    if (![0, 180, 300].includes(s.clock)) s.clock = 0;
    if (!['auto', 'light', 'dark'].includes(s.theme)) s.theme = 'auto';
    return s;
  }
  function loadProgress() {
    const saved = read('progress') || {};
    const p = Object.assign({}, DEFAULT_PROGRESS, saved);
    p.nextFirst = Object.assign({}, DEFAULT_PROGRESS.nextFirst, saved.nextFirst || {});
    p.coach = Object.assign({}, saved.coach || {});
    p.level = Math.max(1, Math.min(9, p.level | 0 || DEFAULT_PROGRESS.level));
    return p;
  }

  root.StressStorage = {
    DEFAULT_SETTINGS,
    DEFAULT_PROGRESS,
    loadSettings,
    saveSettings: s => write('settings', s),
    loadProgress,
    saveProgress: p => write('progress', p),
    loadGame: () => read('game'),
    saveGame: g => write('game', g),
    clearGame: () => write('game', null)
  };
})(typeof self !== 'undefined' ? self : this);
