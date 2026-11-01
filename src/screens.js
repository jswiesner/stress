/* Everything outside the board: home, rivals, puzzles, collection, settings,
   how to play, and the results screen. Each render function rebuilds its
   screen from the profile, so screens always show the current state. */
(function (root) {
  'use strict';
  const R = root.StressRules, P = root.StressProgress, Rivals = root.StressRivals, Art = root.StressArt;
  const I = root.StressIcons, Puzzles = root.StressPuzzles, Fx = root.StressFx, Sound = root.StressSound, BoardView = root.StressBoardView;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const portrait = (r, mood) => (r.acc ? Art.rival(r.acc, mood || 'calm') : Art.piece(R.CROWN, R.RED, mood || 'calm'));

  let app = null;

  // ---------------------------------------------------------------- home
  function home() {
    const p = app.profile, lv = P.levelInfo(p.xp);
    $('h-avatar').innerHTML = Art.piece(R.CROWN, R.BLUE, 'calm');
    $('h-level').textContent = 'Level ' + lv.level + ' · ' + lv.title;
    requestAnimationFrame(() => { $('h-xp').style.width = Math.round(100 * lv.into / lv.need) + '%'; });
    if (!$('h-parade').childElementCount) {
      $('h-parade').innerHTML = [[R.RUNNER, 0, 'calm'], [R.JUMPER, 0, 'focus'], [R.CROWN, 0, 'nervous'], [R.GUARD, 1, 'calm'], [R.JUMPER, 1, 'sleepy']]
        .map(([t, s, m]) => '<span class="char">' + Art.piece(t, s, m) + '</span>').join('');
    }
    // the next rival, or the rival game you left
    const saved = app.saved && app.saved.mode === 'rival' && app.saved.opponent ? Rivals.byId(app.saved.opponent.id) : null;
    const idx = saved ? Rivals.RIVALS.indexOf(saved) : P.nextRivalIndex(p), rival = Rivals.RIVALS[idx], rec = p.rivals[rival.id];
    const allBeaten = P.rivalsBeaten(p) === Rivals.RIVALS.length;
    if (saved) {
      $('h-play').innerHTML = '<span class="portrait">' + portrait(rival, 'focus') + '</span><span><span class="eyebrow">Game in progress</span><span class="name">' + esc(rival.name) + '</span><span class="eyebrow">Round ' + Math.min(40, Math.floor(app.saved.state.ply / 2) + 1) + '</span></span><span class="go">Resume</span>';
      $('h-play').setAttribute('aria-label', 'Resume your game against ' + rival.name);
    } else $('h-play').innerHTML =
      '<span class="portrait">' + portrait(rival, 'calm') + '</span>' +
      '<span><span class="eyebrow">' + (allBeaten ? 'Rematch · Rival 10 of 10' : 'Rival ' + (idx + 1) + ' of 10') + '</span>' +
      '<span class="name">' + esc(rival.name) + '</span>' + I.stars(rec ? rec.stars : 0) + '</span>' +
      '<span class="go">Play</span>';
    if (!saved) $('h-play').setAttribute('aria-label', 'Play rival ' + (idx + 1) + ', ' + rival.name);
    // the daily puzzle
    const today = P.dayKey(), daily = app.dailyPuzzle(), done = p.daily.last === today, streak = P.streakNow(p, today);
    const d = new Date();
    $('h-daily').innerHTML =
      '<span class="cal"><b>' + d.toLocaleString('en', { month: 'short' }).toUpperCase() + '</b><span>' + d.getDate() + '</span></span>' +
      '<span><h3>Daily puzzle</h3><p>' + (done ? 'Solved. New puzzle tomorrow.' : 'Win in ' + daily.n + ' · keep your streak') + '</p></span>' +
      (done ? '<span class="done-tag">' + I.check + ' Done</span>' : '<span class="streak' + (streak ? '' : ' cold') + '">' + I.flame + streak + '</span>');
    $('h-daily').setAttribute('aria-label', 'Daily puzzle, ' + (done ? 'solved today' : 'win in ' + daily.n) + ', streak ' + streak);
    const total = Puzzles.packs.reduce((n, k) => n + k.puzzles.length, 0);
    $('h-puzzles-sub').textContent = P.solvedCount(p) + ' of ' + total + ' solved';
    $('h-rivals-sub').textContent = P.totalStars(p) + ' of 30 stars';
    $('h-quick-sub').textContent = 'Level ' + p.stats.quickLevel + ' · adapts';
  }

  // ---------------------------------------------------------------- rivals
  function rivals() {
    const p = app.profile, next = P.nextRivalIndex(p);
    $('rivals-sum').innerHTML = '<span>' + I.star + P.totalStars(p) + ' / 30</span><span>' + I.trophy + P.rivalsBeaten(p) + ' / 10 beaten</span>';
    $('rivals-list').innerHTML = Rivals.RIVALS.map((r, i) => {
      const rec = p.rivals[r.id], locked = !P.rivalUnlocked(p, i);
      return '<button class="rival-row' + (i === next && !(rec && rec.wins) ? ' next' : '') + (locked ? ' locked' : '') + '" data-rival="' + r.id + '"' + (locked ? ' aria-disabled="true"' : '') + '>' +
        '<span class="portrait">' + portrait(r, locked ? 'sleepy' : 'calm') + '</span>' +
        '<span><span class="num">Rival ' + (i + 1) + '</span><h3>' + esc(locked ? '???' : r.name) + '</h3><p>' + esc(locked ? 'Beat ' + Rivals.RIVALS[i - 1].name + ' to unlock' : r.quote) + '</p></span>' +
        (locked ? '<span class="lock">' + I.lock + '</span>' : I.stars(rec ? rec.stars : 0)) + '</button>';
    }).join('');
    $('rivals-list').onclick = e => {
      const b = e.target.closest('[data-rival]');
      if (!b || b.classList.contains('locked')) return;
      prematch(b.dataset.rival);
    };
  }

  function prematch(id) {
    const r = Rivals.byId(id), rec = app.profile.rivals[id] || { stars: 0 };
    const goal = (n, text) => '<li class="' + (rec.stars >= n ? 'got' : '') + '">' + I.stars(n, n) + '<span>' + text + '</span></li>';
    app.sheet(
      '<div class="prematch"><div class="big-portrait">' + portrait(r, Rivals.RIVALS.indexOf(r) < 3 ? 'happy' : 'focus') + '</div>' +
      '<span class="bubble">' + esc(r.quote) + '</span><h2>' + esc(r.name) + '</h2>' +
      '<div class="chips"><span class="chip">Rival ' + (Rivals.RIVALS.indexOf(r) + 1) + ' of 10</span><span class="chip">' + esc(r.plays) + '</span></div>' +
      '<ul class="goals">' + goal(1, 'Win') + goal(2, 'Win with 5 Stress or less') + goal(3, 'Win with 2 Stress or less') + '</ul>' +
      '<div class="sheet-actions"><button class="btn primary wide" data-act="play">Play ' + esc(Rivals.shortName(r)) + '</button><button class="btn ghost wide" data-act="close">Not now</button></div></div>',
      act => { if (act === 'play') app.startRival(id); }
    );
  }

  // ---------------------------------------------------------------- puzzles
  let openPack = null;
  function puzzles() {
    const p = app.profile, today = P.dayKey(), daily = app.dailyPuzzle(), done = p.daily.last === today, streak = P.streakNow(p, today);
    let html = '<button class="daily-big" id="pz-daily"><span><h3>Daily puzzle</h3><p>' + (done ? 'Solved today. Come back tomorrow!' : 'Win in ' + daily.n + '. A new one every day.') + '</p></span>' +
      '<span class="streak">' + I.flame + streak + '</span></button>';
    html += '<p class="section-title">Packs</p><div class="packs">';
    for (const pack of Puzzles.packs) {
      const solved = P.packSolved(p, pack);
      // Packs open in order: the next pack unlocks once you've solved 5 in the one before.
      const i = Puzzles.packs.indexOf(pack), prev = Puzzles.packs[i - 1];
      const locked = !P.packUnlocked(p, Puzzles.packs, i);
      html += '<div class="pack' + (pack.n >= 4 ? ' hard' : '') + '"><div class="pack-head"><div><h3>' + esc(pack.name) + '</h3><p>' + esc(locked ? 'Solve ' + P.PACK_UNLOCK + ' in ' + prev.name + ' to unlock' : pack.blurb + ' · ' + solved + ' of ' + pack.puzzles.length) + '</p></div>' +
        (locked ? '<span class="lock">' + I.lock + '</span>' : '<button class="btn small" data-pack="' + pack.id + '">' + (openPack === pack.id ? 'Hide' : 'Open') + '</button>') + '</div>' +
        '<div class="progress"><i style="width:' + Math.round(100 * solved / pack.puzzles.length) + '%"></i></div>';
      if (openPack === pack.id && !locked) {
        // Gold star: solved without a hint. Check: solved with one. A dot: tried, not solved yet.
        html += '<div class="puzzle-grid">' + pack.puzzles.map((z, k) => {
          const rec = p.puzzles[z.id] || {}, s = !!rec.solved, tried = !s && rec.tries > 0;
          const label = 'Puzzle ' + (k + 1) + (s ? (rec.clean ? ', solved without a hint' : ', solved with a hint') : tried ? ', ' + rec.tries + (rec.tries === 1 ? ' try' : ' tries') + ' so far' : '');
          return '<button class="pz' + (s ? ' solved' : '') + (s && rec.clean ? ' clean' : '') + (tried ? ' tried' : '') + '" data-pz="' + z.id + '" aria-label="' + label + '">' + (s ? (rec.clean ? I.star : I.check) : k + 1) + '</button>';
        }).join('') + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    $('puzzles-body').innerHTML = html;
    $('pz-daily').onclick = () => app.startDaily();
    $('puzzles-body').onclick = e => {
      const pk = e.target.closest('[data-pack]');
      if (pk) { openPack = openPack === pk.dataset.pack ? null : pk.dataset.pack; Sound.play('pop'); puzzles(); return; }
      const z = e.target.closest('[data-pz]');
      if (z) app.startPuzzleById(z.dataset.pz);
    };
  }

  // ---------------------------------------------------------------- collection
  let tab = 'themes';
  function collection(which) {
    if (which) tab = which;
    document.querySelectorAll('#screen-collection [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    const p = app.profile, body = $('collection-body');
    if (tab === 'themes') {
      const open = new Set(P.unlockedThemes(p));
      body.innerHTML = '<div class="themes">' + P.THEMES.map(t => {
        const ok = open.has(t.id);
        return '<button class="theme-card' + (p.theme === t.id ? ' current' : '') + (ok ? '' : ' locked') + '" data-theme-id="' + t.id + '" data-board="' + t.id + '">' +
          '<span class="mini">' + Array.from({ length: 15 }, (_, i) => '<i' + (i >= 5 && i < 10 ? ' class="r"' : '') + '></i>').join('') + Art.piece(R.JUMPER, 0, ok ? 'happy' : 'sleepy') + '</span>' +
          '<b>' + esc(t.name) + (p.theme === t.id ? ' · in use' : '') + '</b><span>' + esc(ok ? (p.theme === t.id ? 'Your board' : 'Tap to use') : t.need) + '</span></button>';
      }).join('') + '</div>';
    } else if (tab === 'awards') {
      body.innerHTML = '<div class="achievements">' + P.ACHIEVEMENTS.map(a => {
        const got = p.achievements[a.id];
        return '<div class="ach' + (got ? ' got' : '') + '"><span class="badge">' + (got ? I.medal : I.lock) + '</span><span><b>' + esc(a.name) + '</b><span>' + esc(a.text) + '</span></span></div>';
      }).join('') + '</div>';
    } else {
      const s = p.stats, lv = P.levelInfo(p.xp);
      const stat = (v, k) => '<div class="stat"><b>' + v + '</b><span>' + k + '</span></div>';
      body.innerHTML = '<div class="stats-grid">' + stat(lv.level, 'Level · ' + lv.title) + stat(p.xp, 'Total XP') +
        stat(s.wins + ' / ' + s.games, 'Wins vs computer') + stat(s.games ? Math.round(100 * s.wins / s.games) + '%' : '–', 'Win rate') +
        stat(P.totalStars(p), 'Rival stars') + stat(P.solvedCount(p), 'Puzzles solved') + stat(p.daily.best, 'Best daily streak') +
        stat(s.crowns, 'Crowns captured') + stat(s.cracks, 'Rivals cracked') + stat(s.raids, 'Raid hits landed') +
        stat(Object.keys(p.achievements).length + ' / ' + P.ACHIEVEMENTS.length, 'Awards') + stat(s.pvp, 'Two-player games') + '</div>';
    }
    body.onclick = e => {
      const c = e.target.closest('[data-theme-id]');
      if (!c || c.classList.contains('locked')) return;
      app.profile.theme = c.dataset.themeId;
      app.saveProfile();
      app.applyBoard();
      Sound.play('pop');
      collection();
    };
  }

  // ---------------------------------------------------------------- settings
  function settings() {
    const s = app.settings;
    const sw = (id, on, title, text) => '<div class="setting"><div><h3 id="l-' + id + '">' + title + '</h3><p>' + text + '</p></div><button class="switch" data-set="' + id + '" role="switch" aria-checked="' + on + '" aria-labelledby="l-' + id + '"></button></div>';
    const seg = (id, val, title, opts, text) => '<div class="setting"><div><h3>' + title + '</h3>' + (text ? '<p>' + text + '</p>' : '') + '</div><div class="seg" role="radiogroup" aria-label="' + title + '">' +
      opts.map(([v, l]) => '<button data-seg="' + id + '" data-v="' + v + '" role="radio" aria-checked="' + (String(val) === String(v)) + '">' + l + '</button>').join('') + '</div></div>';
    $('settings-body').innerHTML =
      sw('sound', s.sound, 'Sound effects', 'Soft pops, chimes and cracks.') +
      sw('music', s.music, 'Music', 'A calm ambient soundtrack.') +
      (root.StressHaptics.available ? sw('haptics', s.haptics, 'Haptics', 'Little taps you can feel.') : '') +
      sw('hints', s.hints, 'Hints', 'Mark risky moves, and let worried pieces show it.') +
      seg('appearance', s.appearance, 'Appearance', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) +
      seg('clock', s.clock, 'Two-player clock', [[0, 'Off'], [180, '3 min'], [300, '5 min']], 'Time for each player. Run out and you lose.') +
      '<div class="setting"><div><h3>How to play</h3><p>The rules, the pieces, raids and nerve.</p></div><button class="btn small" data-do="rules">Open</button></div>' +
      '<div class="setting"><div><h3>Tutorial</h3><p>Play the one-minute lesson again.</p></div><button class="btn small" data-do="tutorial">Replay</button></div>' +
      '<div class="setting"><div><h3>Reset progress</h3><p>Erase levels, stars, puzzles and awards on this device.</p></div><button class="btn small" data-do="reset">Reset</button></div>' +
      '<div class="about"><b>Stress ' + esc(app.version) + '</b><span>Made by Paul</span><span>Fonts: Figtree and Unbounded (SIL Open Font License)</span><span>No ads. No accounts. Your progress stays on this device.</span></div>';
    $('settings-body').onclick = e => {
      const t = e.target.closest('[data-set]'), g = e.target.closest('[data-seg]'), d = e.target.closest('[data-do]');
      if (t) { s[t.dataset.set] = !s[t.dataset.set]; app.saveSettings(); app.applySettings(); Sound.play('pop'); settings(); }
      if (g) { const v = g.dataset.v; s[g.dataset.seg] = g.dataset.seg === 'clock' ? Number(v) : v; app.saveSettings(); app.applySettings(); settings(); }
      if (d && d.dataset.do === 'rules') app.show('rules');
      if (d && d.dataset.do === 'tutorial') app.startTutorial();
      if (d && d.dataset.do === 'reset') {
        if (d.dataset.armed) { app.resetProgress(); return; }
        d.dataset.armed = '1';
        d.textContent = 'Tap again to erase';
        setTimeout(() => { if (d.isConnected) { delete d.dataset.armed; d.textContent = 'Reset'; } }, 3000);
      }
    };
  }

  // ---------------------------------------------------------------- how to play
  function rules() {
    const body = $('rules-body');
    if (body.dataset.drawn) return;
    body.dataset.drawn = '1';
    body.innerHTML =
      '<p>Raid your opponent’s half to pile on Stress. First to 10 cracks. Or capture their Crown.</p>' +
      '<ol class="rules">' +
      '<li><b>Board.</b> 7×7. The three rows nearest you are your half. The river in the middle belongs to no one.</li>' +
      '<li><b>Pieces.</b> Each side has a Crown, 2 Guards, 2 Runners and 2 Jumpers.</li>' +
      '<li><b>Your turn.</b> Move one piece. Land on an enemy piece to capture it. The first move alternates from game to game.</li>' +
      '<li class="key"><b>Raid.</b> At the start of your turn, each of your pieces in the enemy half adds 1 to your opponent’s Stress.</li>' +
      '<li class="key"><b>Nerve.</b> A raider can do that 3 times. After its third hit it cracks and leaves the board. Move it back to the river or your half and its nerve refills. Your Crown never cracks.</li>' +
      '<li><b>Win.</b> Your opponent reaches 10 Stress, or you capture their Crown.</li>' +
      '<li><b>Time limit.</b> If nobody has won after 40 rounds, the player with less Stress wins. If it’s tied, play on until someone takes another point. <span class="fine">(If 10 more rounds pass without a hit, the side with more pieces wins.)</span></li>' +
      '</ol><p class="section-title">The pieces</p><div class="piece-cards">' +
      card('crown', 'Crown', 'One square in any direction. Lose it and you lose. It never cracks.') +
      card('guard', 'Guard', 'The square one. Moves 1 or 2 squares straight. Can’t jump.') +
      card('runner', 'Runner', 'The diamond. Moves 1 or 2 squares diagonally. Can’t jump.') +
      card('jumper', 'Jumper', 'The one with ears. Hops in an L, over anything. The best raider.') +
      '</div><p class="section-title">Reading the board</p>' +
      '<p>Gold dots under a raider count its nerve; a red dot means one hit left. With hints on, pieces that could be captured look worried, amber marks risky squares, and red marks a move that loses or exposes your Crown. Tap an opponent’s piece to see where it can go.</p>';
    const D = {
      crown: [['.....', '.....', '..C..', '.....', '.....'], { b4: 'dot', c4: 'dot', d4: 'dot', b3: 'dot', d3: 'dot', b2: 'dot', c2: 'dot', d2: 'dot' }],
      guard: [['.....', '.....', '..G.r', '.....', '.....'], { c5: 'dot', c4: 'dot', c2: 'dot', c1: 'dot', a3: 'dot', b3: 'dot', d3: 'dot', e3: 'ring' }],
      runner: [['.....', '...G.', '..R..', '.....', '.....'], { b4: 'dot', a5: 'dot', b2: 'dot', a1: 'dot', d2: 'dot', e1: 'dot' }],
      jumper: [['.....', '..G..', '.GJ..', '.....', '.....'], { b5: 'dot', d5: 'dot', a4: 'dot', e4: 'dot', a2: 'dot', e2: 'dot', b1: 'dot', d1: 'dot' }]
    };
    body.querySelectorAll('[data-diagram]').forEach(el => { const [rows, marks] = D[el.dataset.diagram]; BoardView.diagram(el, rows, marks, {}, el.dataset.label); });
    function card(id, name, text) { return '<div class="piece-card"><div data-diagram="' + id + '" data-label="' + name + ' moves"></div><div><h3>' + name + '</h3><p>' + text + '</p></div></div>'; }
  }

  // ---------------------------------------------------------------- results
  function results(result, rewards, ctx) {
    const scr = $('screen-results');
    const mode = result.mode, won = result.won;
    const rival = ctx.rival;
    let title, sub, primary, secondary = [];
    const reason = reasonText(result, ctx);
    if (mode === 'tutorial') {
      title = 'You’re ready!'; sub = 'You know how to raid, retreat, capture and crack. Time for your first rival.';
      primary = ['next-rival', 'Meet ' + Rivals.RIVALS[0].name];
    } else if (mode === 'puzzle') {
      const tries = rewards.tries || result.tries || 1;
      title = won ? (result.daily ? 'Daily solved!' : tries === 1 && !result.hinted ? 'First try!' : 'Solved!') : 'Not this time';
      const when = tries > 1 ? ' on try ' + tries : result.daily && !result.hinted ? ' on the first try' : '';
      sub = won ? 'Won in ' + result.myMoves + ' move' + (result.myMoves === 1 ? '' : 's') + when + (result.hinted ? (when ? ', with a hint.' : ' with a hint.') : '.') : reason;
      primary = result.daily ? ['more-puzzles', 'More puzzles'] : ['next-puzzle', 'Next puzzle'];
      if (result.daily && won) secondary.push(['share', 'Share']);
      if (!result.daily) secondary.push(['puzzles', 'All puzzles']);
    } else if (mode === 'pvp') {
      title = result.winner === R.DRAW ? 'A draw' : R.PLAYER_NAMES[result.winner] + ' wins!'; sub = reason;
      primary = ['again', 'Rematch'];
    } else {
      title = won ? 'Victory!' : (rival ? rival.name + ' wins' : 'Defeat');
      sub = reason;
      if (mode === 'rival' && won && P.nextRivalIndex(app.profile) !== Rivals.RIVALS.indexOf(rival) && Rivals.RIVALS.indexOf(rival) < 9) primary = ['next-rival', 'Next rival'];
      else primary = ['again', won ? 'Play again' : 'Try again'];
      if (!won && ctx.canUndo) secondary.push(['undo', 'Undo last move']);
      if (mode === 'rival' && won && primary[0] === 'next-rival') secondary.push(['again', 'Play again']);
    }
    const tip = !won && (mode === 'rival' || mode === 'quick') ? lossTip(result) : '';
    const meChar = Art.piece(R.CROWN, R.BLUE, won || mode === 'tutorial' ? 'happy' : 'sad');
    const themChar = rival ? portrait(rival, won ? 'sad' : 'happy') : Art.piece(R.CROWN, R.RED, won ? 'sad' : 'happy');
    const showStars = mode === 'rival';
    const lv = rewards.after, levelUp = rewards.after.level > rewards.before.level;
    let html =
      '<div class="res-chars"><span class="char' + (won || mode === 'tutorial' ? ' bounce' : '') + '">' + meChar + '</span>' + (mode === 'tutorial' ? '' : '<span class="char small">' + themChar + '</span>') + '</div>' +
      '<h1 class="res-title' + (won ? ' win' : '') + '">' + esc(title) + '</h1><p class="res-sub">' + esc(sub) + '</p>';
    if (showStars) html += '<div class="res-stars" aria-label="' + rewards.stars + ' stars">' + [1, 2, 3].map(n => '<span class="st" data-n="' + n + '">' + (n <= rewards.stars ? I.star : I.starEmpty) + '</span>').join('') + '</div>';
    if (rewards.xp) {
      html += '<div class="res-xp"><div class="row"><span>+' + rewards.xp + ' XP</span><span id="res-lvl">Level ' + rewards.before.level + '</span></div><div class="xpbar"><i id="res-xpbar"></i></div></div>';
    }
    const unl = [];
    if (levelUp) unl.push([I.trophy, 'Level ' + lv.level + '!', 'You’re now ' + lv.title + '.']);
    if (rewards.streak && result.daily) unl.push([I.flame, rewards.streak + '-day streak', 'Come back tomorrow to keep it going.']);
    rewards.unlocked.forEach(id => { const t = P.THEMES.find(x => x.id === id); unl.push([I.palette, 'New board: ' + t.name, 'Find it in your Collection.']); });
    if (rewards.newClean && !rewards.firstSolve) unl.push([I.star, 'Clean solve', 'Solved without a hint. This puzzle now has a gold star.']);
    rewards.achievements.forEach(id => { const a = P.ACHIEVEMENTS.find(x => x.id === id); unl.push([I.medal, a.name, a.text]); });
    if (unl.length) html += '<div class="res-unlocks">' + unl.map((u, i) => '<div class="unlock" style="animation-delay:' + (0.6 + i * 0.15) + 's"><span class="badge">' + u[0] + '</span><span><b>' + esc(u[1]) + '</b><span>' + esc(u[2]) + '</span></span></div>').join('') + '</div>';
    if (tip) html += '<p class="res-tip">' + esc(tip) + '</p>';
    html += '<div class="res-actions"><button class="btn primary wide" data-res="' + primary[0] + '">' + esc(primary[1]) + '</button>' +
      secondary.map(([a, l]) => '<button class="btn wide" data-res="' + a + '">' + (a === 'share' ? I.share : a === 'undo' ? I.undo : '') + esc(l) + '</button>').join('') +
      '<button class="btn ghost wide" data-res="home">Home</button></div>';
    scr.innerHTML = html;
    app.show('results');
    scr.onclick = e => { const b = e.target.closest('[data-res]'); if (b) app.resultAction(b.dataset.res, result, ctx); };
    // reveal: stars, then XP
    if (won || mode === 'tutorial') { Fx.confetti(won ? 90 : 60); Sound.play('win'); } else Sound.play('lose');
    let delay = 450;
    if (showStars) scr.querySelectorAll('.st').forEach((st, i) => {
      setTimeout(() => { st.classList.add(i < rewards.stars ? 'on' : 'off'); if (i < rewards.stars) { Sound.play('star'); root.StressHaptics.play('tap'); } }, delay + i * 320);
    });
    if (showStars) delay += 3 * 320;
    const bar = $('res-xpbar');
    if (bar) {
      const b = rewards.before, a = rewards.after;
      bar.style.transition = 'none';
      bar.style.width = Math.round(100 * b.into / b.need) + '%';
      setTimeout(() => {
        bar.style.transition = '';
        if (levelUp) {
          bar.style.width = '100%';
          setTimeout(() => {
            $('res-lvl').textContent = 'Level ' + a.level;
            Sound.play('levelup');
            bar.style.transition = 'none';
            bar.style.width = '0%';
            requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = ''; bar.style.width = Math.round(100 * a.into / a.need) + '%'; }));
          }, 900);
        } else bar.style.width = Math.round(100 * a.into / a.need) + '%';
      }, delay);
    }
    if (unl.length) setTimeout(() => Sound.play('unlock'), 700);
  }

  function reasonText(r, ctx) {
    const you = r.mode !== 'pvp', w = r.winner, l = w === R.DRAW ? -1 : 1 - w;
    const name = p => (you ? (p === R.BLUE ? 'You' : (ctx.rival ? Rivals.shortName(ctx.rival) : 'Red')) : R.PLAYER_NAMES[p]);
    const lower = p => (you && p === R.BLUE ? 'you' : name(p));
    switch (r.reason) {
      case 'stress': return name(l) + ' cracked under pressure.';
      case 'crown': return you ? (w === R.BLUE ? 'You captured the Crown.' : name(w) + ' captured your Crown.') : R.PLAYER_NAMES[w] + ' captured the Crown.';
      case 'limit': return 'After 40 rounds, ' + lower(w) + ' stayed calmer: ' + (w === R.BLUE ? r.myStress + ' to ' + r.theirStress : r.theirStress + ' to ' + r.myStress) + '.';
      case 'sudden-death': return 'Sudden death: ' + lower(l) + ' took the next hit.';
      case 'stuck': return name(l) + ' had no moves left.';
      case 'time': return name(l) + ' ran out of time.';
      case 'pieces': return 'Sudden death ran long, so the side with more pieces wins.';
      default: return '';
    }
  }

  function lossTip(r) {
    if (r.reason === 'crown') return 'Tip: keep a Guard or Runner next to your Crown, and watch for Jumpers: they hop over everything.';
    if (r.reason === 'stress' && r.raids < 3) return 'Tip: you landed only ' + r.raids + ' raid hit' + (r.raids === 1 ? '' : 's') + '. Raid more: every surviving raider hits each turn.';
    if (r.reason === 'stress') return 'Tip: capture raiders in your half before they hit. Each one you leave costs you a point per turn.';
    return 'Tip: Stress only goes up. Take the lead early and make them chase you.';
  }

  function bind(appRef) {
    app = appRef;
    document.querySelectorAll('#screen-collection [data-tab]').forEach(b => b.addEventListener('click', () => { Sound.play('pop'); collection(b.dataset.tab); }));
  }

  root.StressScreens = { bind, home, rivals, prematch, puzzles, collection, settings, rules, results, portrait };
})(typeof self !== 'undefined' ? self : this);
