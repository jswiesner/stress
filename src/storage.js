/* The player's profile, settings and the game in progress, kept in this device's
   localStorage. Every read and write is guarded: private windows and blocked
   storage just mean nothing is remembered, never a broken screen.
   Stress 2.0 players keep their settings and record when they update. */
(function (root) {
  'use strict';
  const P = root.StressProgress;
  const KEY = { profile: 'stress3.profile', settings: 'stress3.settings', game: 'stress3.game' };

  const DEFAULT_SETTINGS = {
    sound: true,
    music: true,
    haptics: true,
    hints: true,
    appearance: 'auto', // auto | light | dark
    clock: 0 // two-player clock, seconds per player; 0 = off
  };

  function read(key) {
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function write(key, value) {
    try {
      if (value === null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: keep playing without it */ }
  }

  // One-time import from Stress 2.0's keys.
  function migrate() {
    if (read(KEY.profile) || read(KEY.settings)) return;
    const s2 = read('stress2.settings'), p2 = read('stress2.progress');
    if (!s2 && !p2) return;
    const settings = Object.assign({}, DEFAULT_SETTINGS);
    if (s2) {
      if (typeof s2.sound === 'boolean') settings.sound = s2.sound;
      if (typeof s2.hints === 'boolean') settings.hints = s2.hints;
      if (['auto', 'light', 'dark'].includes(s2.theme)) settings.appearance = s2.theme;
      if ([0, 180, 300].includes(s2.clock)) settings.clock = s2.clock;
    }
    const profile = P.newProfile();
    if (p2) {
      profile.stats.games = p2.played | 0;
      profile.stats.wins = p2.won | 0;
      profile.stats.quickLevel = Math.max(1, Math.min(9, p2.level | 0 || 3));
      profile.tutorialDone = (p2.played | 0) > 0; // they know the rules already
      profile.seen.whatsNew3 = false;
    }
    write(KEY.settings, settings);
    write(KEY.profile, profile);
  }

  function loadSettings() {
    migrate();
    const s = Object.assign({}, DEFAULT_SETTINGS, read(KEY.settings) || {});
    if (!['auto', 'light', 'dark'].includes(s.appearance)) s.appearance = 'auto';
    if (![0, 180, 300].includes(s.clock)) s.clock = 0;
    return s;
  }

  root.StressStorage = {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings: s => write(KEY.settings, s),
    loadProfile: () => { migrate(); return P.normalize(read(KEY.profile)); },
    saveProfile: p => write(KEY.profile, p),
    loadGame: () => read(KEY.game),
    saveGame: g => write(KEY.game, g),
    clearGame: () => write(KEY.game, null),
    resetAll: () => { write(KEY.profile, null); write(KEY.game, null); }
  };
})(typeof self !== 'undefined' ? self : this);
