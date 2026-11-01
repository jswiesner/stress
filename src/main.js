/* Stress 3.0 app shell: boot, navigation, sheets, audio, and starting every mode. */
(function (root) {
  'use strict';
  const R = root.StressRules, P = root.StressProgress, Rivals = root.StressRivals, Art = root.StressArt, I = root.StressIcons;
  const Store = root.StressStorage, Sound = root.StressSound, Music = root.StressMusic, Haptics = root.StressHaptics, Native = root.StressNative;
  const Match = root.StressMatch, Screens = root.StressScreens, Tutorial = root.StressTutorial, Puzzles = root.StressPuzzles;
  const $ = id => document.getElementById(id);

  const app = {
    version: '3.0.0',
    store: Store,
    settings: Store.loadSettings(),
    profile: Store.loadProfile(),
    screen: null,
    saved: null,
    stack: []
  };
  const initialTheme = document.documentElement.getAttribute('data-theme');
  let toastTimer = null, audioReady = false;

  // ---------------------------------------------------------------- basics
  app.saveProfile = () => Store.saveProfile(app.profile);
  app.saveSettings = () => Store.saveSettings(app.settings);

  app.toast = (text, ms) => {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2200);
  };

  app.applySettings = () => {
    Sound.setEnabled(app.settings.sound);
    Haptics.setEnabled(app.settings.haptics);
    const rootEl = document.documentElement;
    if (app.settings.appearance === 'auto') { if (initialTheme) rootEl.setAttribute('data-theme', initialTheme); else rootEl.removeAttribute('data-theme'); }
    else rootEl.setAttribute('data-theme', app.settings.appearance);
    Native.appearance(app.settings.appearance);
    const on = app.settings.sound || app.settings.music;
    $('g-sound').innerHTML = on ? I.sound : I.mute;
    $('g-sound').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (audioReady) { if (app.settings.music) Music.start(); else Music.stop(); }
  };
  app.applyBoard = () => { document.documentElement.setAttribute('data-board', app.profile.theme || 'mist'); };

  // Browsers only allow sound after the first touch.
  app.unlockAudio = () => {
    if (audioReady) return;
    audioReady = true;
    Sound.unlock();
    if (app.settings.music) Music.start();
  };

  // ---------------------------------------------------------------- navigation
  const RENDER = { home: () => Screens.home(), rivals: () => Screens.rivals(), puzzles: () => Screens.puzzles(), collection: () => Screens.collection(), settings: () => Screens.settings(), rules: () => Screens.rules() };
  app.show = (name, opts) => {
    if (name === 'home') app.stack = [];
    else {
      // Returning to a screen already in the history trims everything after it.
      const i = app.stack.indexOf(name);
      if (i >= 0) app.stack.length = i;
      else if (app.screen && app.screen !== name && !(opts && opts.replace)) app.stack.push(app.screen);
    }
    app.screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (RENDER[name]) RENDER[name]();
    if (name !== 'game') Match.pauseClock(); else Match.resumeClock();
    const scroller = document.querySelector('#screen-' + name + ' .scroll');
    if (scroller && !(opts && opts.keepScroll)) scroller.scrollTop = 0;
  };
  app.back = () => {
    let prev;
    while ((prev = app.stack.pop())) {
      if (prev === 'game' && Match.current && !Match.current.finished) break; // back to a game in progress
      if (prev !== 'game' && prev !== 'results' && prev !== 'tutorial') break;
    }
    app.show(prev || 'home', { replace: true });
  };

  app.sheet = (html, onAct) => {
    const host = $('sheet-root');
    host.innerHTML = '<div class="sheet-wrap"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div></div>';
    const wrap = host.firstChild;
    const close = () => { host.innerHTML = ''; };
    wrap.addEventListener('click', e => {
      if (e.target === wrap) { close(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      close();
      if (b.dataset.act !== 'close' && onAct) onAct(b.dataset.act);
    });
    const first = wrap.querySelector('[data-act]');
    if (first) first.focus({ preventScroll: true });
    Sound.play('whoosh');
  };
  app.closeSheet = () => { $('sheet-root').innerHTML = ''; };

  // ---------------------------------------------------------------- modes
  const flip = mode => {
    const nf = app.profile.nextFirst || (app.profile.nextFirst = { rival: 0, quick: 0, pvp: 0 });
    const first = nf[mode] === R.RED ? R.RED : R.BLUE;
    nf[mode] = 1 - first;
    app.saveProfile();
    return first;
  };
  const opponentFor = (r, level) => ({
    id: r.id, name: r.name, short: Rivals.shortName(r), level: level || r.level, style: r.style, budget: r.budget, lines: r.lines,
    art: mood => Screens.portrait(r, mood)
  });

  function begin(cfg, ctx) {
    app.closeSheet();
    app.current = ctx;
    app.show('game');
    Match.start(Object.assign({ app, onFinish: res => app.onMatchFinish(res, ctx) }, cfg));
  }

  app.startRival = id => {
    const r = Rivals.byId(id);
    const first = flip('rival');
    begin({ mode: 'rival', state: R.newGame({ first }), opponent: opponentFor(r) }, { mode: 'rival', rival: r });
    if (first === R.RED) app.toast(Rivals.shortName(r) + ' moves first this time');
  };
  app.startQuick = () => {
    const level = app.profile.stats.quickLevel || 3, first = flip('quick');
    begin({ mode: 'quick', state: R.newGame({ first }), opponent: opponentFor(Rivals.SPARRING, level) }, { mode: 'quick', rival: Rivals.SPARRING });
  };
  app.startPvp = () => {
    const first = flip('pvp'), c = app.settings.clock;
    begin({ mode: 'pvp', state: R.newGame({ first }), clocks: c ? [c * 1000, c * 1000] : null }, { mode: 'pvp' });
    app.toast(R.PLAYER_NAMES[first] + ' moves first');
  };
  const findPuzzle = id => {
    for (const pack of Puzzles.packs) { const i = pack.puzzles.findIndex(z => z.id === id); if (i >= 0) return { puzzle: pack.puzzles[i], pack, index: i }; }
    const d = Puzzles.daily.findIndex(z => z.id === id);
    return d >= 0 ? { puzzle: Puzzles.daily[d], pack: null, index: d } : null;
  };
  app.dailyPuzzle = () => Puzzles.daily[P.dailyPuzzleIndex(Puzzles.daily.length)];
  function startPuzzle(z, ctx) {
    const state = R.fromRows(z.rows, { stress: z.stress, hits: z.hits, ply: z.ply });
    begin({ mode: 'puzzle', state, puzzle: { id: z.id, n: z.n, daily: !!ctx.daily, solution: z.solution, label: ctx.label } }, Object.assign({ mode: 'puzzle', puzzle: z }, ctx));
    app.toast(ctx.daily ? 'Daily puzzle: win in ' + z.n : 'Win in ' + z.n + (z.n === 1 ? ' move' : ' moves'), 1800);
  }
  app.startPuzzleById = id => {
    const f = findPuzzle(id);
    if (f) startPuzzle(f.puzzle, { pack: f.pack, index: f.index, label: f.pack ? f.pack.name + ' ' + (f.index + 1) : '' });
  };
  app.startDaily = () => {
    const z = app.dailyPuzzle();
    startPuzzle(z, { daily: true, label: 'Daily' });
  };
  app.startTutorial = () => {
    app.closeSheet();
    app.show('tutorial');
    Tutorial.start(app);
  };
  app.finishTutorial = skipped => {
    if (skipped) {
      // Skipping counts as having seen it, but the reward is for finishing.
      app.profile.tutorialDone = true;
      app.saveProfile();
      app.show('home');
      return;
    }
    const { profile, rewards } = P.applyResult(app.profile, { mode: 'tutorial', won: true });
    app.profile = profile;
    app.saveProfile();
    Screens.results({ mode: 'tutorial', won: true }, rewards, { mode: 'tutorial' });
  };

  app.resumeGame = () => {
    const g = app.saved;
    if (!g) return;
    try {
      const state = R.deserialize(g.state);
      const r = g.opponent ? Rivals.byId(g.opponent.id) : null;
      const opponent = r ? opponentFor(r, g.opponent.level) : null;
      begin({ mode: g.mode, state, opponent, history: g.history || [], clocks: g.clocks || null, stats: g.stats, greet: false },
        { mode: g.mode, rival: r || undefined });
    } catch (e) {
      Store.clearGame();
      app.saved = null;
      app.show('home');
    }
  };

  app.closeMatch = () => {
    const ctx = app.current || {};
    Match.stop();
    app.saved = Store.loadGame();
    app.show(ctx.mode === 'puzzle' && !ctx.daily ? 'puzzles' : 'home');
  };

  // ---------------------------------------------------------------- results
  app.onMatchFinish = (result, ctx) => {
    ctx.profileBefore = app.profile;
    if (result.mode === 'quick' && result.winner !== R.DRAW) {
      app.profile = Object.assign({}, app.profile, { stats: Object.assign({}, app.profile.stats, { quickLevel: Math.max(1, Math.min(9, (app.profile.stats.quickLevel || 3) + (result.won ? 1 : -1))) }) });
    }
    const { profile, rewards } = P.applyResult(app.profile, Object.assign({}, result, result.mode === 'quick' ? { level: undefined } : {}));
    app.profile = profile;
    app.saveProfile();
    app.saved = null;
    ctx.canUndo = Match.canUndo() && result.mode !== 'puzzle';
    Screens.results(result, rewards, ctx);
  };

  app.resultAction = (act, result, ctx) => {
    if (act === 'home') { Match.stop(); app.show('home'); return; }
    if (act === 'puzzles') { Match.stop(); app.show('puzzles'); return; }
    if (act === 'undo') {
      app.profile = ctx.profileBefore;
      app.saveProfile();
      app.show('game', { replace: true });
      Match.undo();
      return;
    }
    if (act === 'next-rival') { Match.stop(); app.startRival(Rivals.RIVALS[P.nextRivalIndex(app.profile)].id); return; }
    if (act === 'again') {
      Match.stop();
      if (ctx.mode === 'rival') app.startRival(ctx.rival.id);
      else if (ctx.mode === 'quick') app.startQuick();
      else app.startPvp();
      return;
    }
    if (act === 'next-puzzle') {
      Match.stop();
      const pack = ctx.pack, list = pack ? pack.puzzles : [];
      const next = list.slice(ctx.index + 1).concat(list.slice(0, ctx.index + 1)).find(z => !(app.profile.puzzles[z.id] && app.profile.puzzles[z.id].solved));
      if (next) app.startPuzzleById(next.id); else app.show('puzzles');
      return;
    }
    if (act === 'share') share(result);
  };

  // Where a shared result points: the web build shares its own address; the app shares its
  // App Store page once STORE_URL is filled in, and the playable web version until then.
  const WEB_URL = 'https://jswiesner.github.io/stress/';
  const STORE_URL = ''; // e.g. 'https://apps.apple.com/app/id0000000000'
  function share(result) {
    const day = P.dayNumber(P.dayKey()) + 1, streak = P.streakNow(app.profile);
    const url = /^https?:/.test(location.protocol) ? location.origin + location.pathname : (STORE_URL || WEB_URL);
    const text = 'Stress daily #' + day + ' ✅ solved in ' + result.myMoves + (result.hinted ? ' (with a hint)' : '') + '\n🔥 ' + streak + '-day streak' + (url ? '\n' + url : '');
    const copy = () => {
      try { navigator.clipboard.writeText(text).then(() => app.toast('Copied. Paste it anywhere!'), () => app.toast(text, 4000)); }
      catch (e) { app.toast(text, 4000); }
    };
    if (navigator.share) navigator.share({ text }).catch(err => { if (!err || err.name !== 'AbortError') copy(); });
    else copy();
  }

  app.resetProgress = () => {
    Store.resetAll();
    app.profile = P.normalize(null);
    app.saved = null;
    app.applyBoard();
    app.toast('Progress erased. Fresh start!');
    app.startTutorial();
  };

  // ---------------------------------------------------------------- pause menu
  function pauseMenu() {
    const m = Match.current;
    if (!m) return;
    const puzzle = m.mode === 'puzzle';
    app.sheet(
      '<div class="prematch"><h2>Paused</h2><div class="sheet-actions menu-list">' +
      '<button class="btn primary wide" data-act="close">Resume</button>' +
      (puzzle ? '<button class="btn wide" data-act="restart">' + I.reset + 'Restart puzzle</button>' : '<button class="btn wide" data-act="restart">' + I.reset + 'New game</button>') +
      '<button class="btn wide" data-act="rules">' + I.help + 'How to play</button>' +
      '<button class="btn ghost wide" data-act="quit">' + (puzzle ? 'Back to puzzles' : 'Save and quit') + '</button></div></div>',
      act => {
        if (act === 'rules') app.show('rules');
        else if (act === 'quit') app.closeMatch();
        else if (act === 'restart') {
          if (puzzle) Match.resetPuzzle(false);
          else {
            const ctx = app.current;
            Match.stop();
            Store.clearGame();
            if (ctx.mode === 'rival') app.startRival(ctx.rival.id); else if (ctx.mode === 'quick') app.startQuick(); else app.startPvp();
          }
        }
      }
    );
  }

  // ---------------------------------------------------------------- boot
  function wire() {
    $('defs').innerHTML = Art.defs() + I.STAR_DEFS;
    document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = I[el.dataset.icon] || ''; });
    document.querySelectorAll('[data-back]').forEach(b => { b.innerHTML = I.back; b.addEventListener('click', () => { Sound.play('pop'); app.back(); }); });
    $('h-settings').innerHTML = I.gear;
    $('g-menu').innerHTML = I.more;
    $('h-settings').addEventListener('click', () => app.show('settings'));
    $('h-profile').addEventListener('click', () => app.show('collection'));
    $('h-play').addEventListener('click', () => {
      app.unlockAudio();
      if (app.saved && app.saved.mode === 'rival') { app.resumeGame(); return; }
      const r = Rivals.RIVALS[P.nextRivalIndex(app.profile)];
      Screens.prematch(r.id);
    });
    $('h-daily').addEventListener('click', () => { app.unlockAudio(); app.startDaily(); });
    $('h-puzzles').addEventListener('click', () => app.show('puzzles'));
    $('h-rivals').addEventListener('click', () => app.show('rivals'));
    $('h-quick').addEventListener('click', () => { app.unlockAudio(); if (app.saved && app.saved.mode === 'quick') app.resumeGame(); else app.startQuick(); });
    $('h-pvp').addEventListener('click', () => { app.unlockAudio(); if (app.saved && app.saved.mode === 'pvp') app.resumeGame(); else app.startPvp(); });
    $('g-menu').addEventListener('click', pauseMenu);
    $('g-sound').addEventListener('click', () => {
      const on = !(app.settings.sound || app.settings.music);
      app.settings.sound = on;
      app.settings.music = on;
      app.saveSettings();
      app.unlockAudio();
      app.applySettings();
      app.toast(on ? 'Sound on' : 'Sound off');
    });
    document.addEventListener('pointerdown', app.unlockAudio, { once: true, capture: true });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if ($('sheet-root').firstChild) app.closeSheet();
      else if (app.screen === 'game') pauseMenu();
      else if (app.screen !== 'home' && app.screen !== 'tutorial') app.back();
    });
    Screens.bind(app);
    Match.bind(app);
  }

  function boot() {
    wire();
    app.applyBoard();
    app.applySettings();
    app.saved = Store.loadGame();
    if (app.saved && (!app.saved.state || app.saved.state.winner !== -1)) { Store.clearGame(); app.saved = null; }
    if (!app.profile.tutorialDone) app.startTutorial();
    else {
      app.show('home');
      if (app.profile.seen.whatsNew3 === false) {
        app.profile.seen.whatsNew3 = true;
        app.saveProfile();
        app.toast('Welcome to Stress 3.0: rivals, daily puzzles and a whole new look!', 4200);
      }
    }
    // Take the native launch splash down once the first screen has painted.
    requestAnimationFrame(() => requestAnimationFrame(Native.ready));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !Native.isNative) {
      // Some sandboxed frames and private modes throw just for reading navigator.serviceWorker.
      try { navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ }); } catch (e) { /* same */ }
    }
  }

  root.StressApp = app;
  boot();
})(typeof self !== 'undefined' ? self : this);
