/* Stress 2.0: screens, game flow, input, the computer opponent and saving. */
(function () {
  'use strict';
  const R = window.StressRules, AI = window.StressAI, Store = window.StressStorage;
  const Sound = window.StressSound, BoardView = window.StressBoardView;
  const $ = id => document.getElementById(id);
  const now = () => (window.performance ? performance.now() : Date.now());
  const HUMAN = R.BLUE; // against the computer you play Blue, at the bottom

  let settings = Store.loadSettings();
  let progress = Store.loadProgress();
  let G = null; // the game on screen: { mode, state, history, level, clocks, finished, outcome }
  let view = null;
  let phase = 'idle'; // idle | animating | thinking
  let selected = -1, preview = -1;
  let screen = 'menu', returnTo = 'menu';
  let aiTicket = 0, worker = null, workerFailed = false;
  const pending = new Map();
  let clockTimer = null, clockLast = 0, lastWarnSecond = -1;
  let coachKey = null, toastTimer = null, bannerTimer = null, resetArmedAt = 0;
  const initialTheme = document.documentElement.getAttribute('data-theme');

  const TIPS = {
    select: 'Tap one of your pieces to see where it can go. Tap a red piece to see its moves too.',
    capture: 'You can capture! Land on an enemy piece to take it off the board.',
    raid: 'Raids: at the start of your turn, each of your pieces in the red half adds 1 to Red’s Stress. Red’s raiders do the same to you.',
    nerve: 'One of your raiders has a single hit of nerve left. After its next hit it cracks. Pull it back to refill it, or let it go.',
    win: 'First to 10 Stress cracks and loses. Capturing a Crown wins at once, so keep yours covered.'
  };

  const DIAGRAMS = {
    crown: { rows: ['.....', '.....', '..C..', '.....', '.....'], marks: { b4: 'dot', c4: 'dot', d4: 'dot', b3: 'dot', d3: 'dot', b2: 'dot', c2: 'dot', d2: 'dot' }, label: 'The Crown moves one square in any direction.' },
    guard: { rows: ['.....', '.....', '..G.r', '.....', '.....'], marks: { c5: 'dot', c4: 'dot', c2: 'dot', c1: 'dot', a3: 'dot', b3: 'dot', d3: 'dot', e3: 'ring' }, label: 'The Guard moves one or two squares straight and can capture the enemy piece two squares away.' },
    runner: { rows: ['.....', '...G.', '..R..', '.....', '.....'], marks: { b4: 'dot', a5: 'dot', b2: 'dot', a1: 'dot', d2: 'dot', e1: 'dot' }, label: 'The Runner moves one or two squares diagonally; a friendly Guard blocks one diagonal.' },
    jumper: { rows: ['.....', '..G..', '.GJ..', '.....', '.....'], marks: { b5: 'dot', d5: 'dot', a4: 'dot', e4: 'dot', a2: 'dot', e2: 'dot', b1: 'dot', d1: 'dot' }, label: 'The Jumper moves in an L-shape and hops over the pieces beside it.' },
    raid: { rows: ['.c.....', 'r......', '....J.g', '.......', '....G..', '.......', '...C...'], marks: {}, nerve: { e5: 2 }, label: 'Blue’s Jumper on e5 raids Red’s half with two hits of nerve left.' }
  };
  const MENU_ART = { rows: ['...c...', '...rg..', 'J..Rj..', '.......', '..G..j.', '..G....', '...C...'], nerve: { a5: 1, d5: 2, f3: 2 } };

  // ---------------------------------------------------------------- helpers
  const levelLabel = n => 'Level ' + n + ' · ' + AI.levelName(n);
  const currentLevel = () => (settings.levelMode === 'fixed' ? settings.fixedLevel : progress.level);
  const isComputerTurn = () => !!G && G.mode === 'ai' && G.state.winner === -1 && G.state.turn !== HUMAN;
  const playerName = p => (G && G.mode === 'ai' ? (p === HUMAN ? 'You' : 'Computer') : R.PLAYER_NAMES[p]);
  const subject = p => (G.mode === 'ai' ? (p === HUMAN ? 'You' : 'The computer') : R.PLAYER_NAMES[p]);
  const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function haptic(pattern) {
    if (!settings.sound || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* not supported */ }
  }

  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function banner(text) {
    const el = $('banner');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.hidden = true; }, 1900);
  }

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') {
      if (initialTheme) root.setAttribute('data-theme', initialTheme);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', settings.theme);
  }

  function saveSettings() {
    Store.saveSettings(settings);
  }

  // ---------------------------------------------------------------- screens
  function show(name) {
    if (name !== screen) { $('toast').hidden = true; clearTimeout(toastTimer); }
    screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name === 'menu') renderMenu();
    if (name === 'rules') renderRules();
    if (name === 'settings') renderSettings();
    if (name === 'game') { render(); if (G && phase === 'idle' && !G.finished) startClock(); }
    else stopClock();
    // Keep keyboard users oriented: land on the new screen's back button.
    const backBtn = document.querySelector('#screen-' + name + ' .topbar .icon-btn');
    if (backBtn && name !== 'game' && document.activeElement && document.activeElement !== document.body) backBtn.focus({ preventScroll: true });
  }

  function renderMenu() {
    const saved = Store.loadGame();
    const resumable = !!(saved && saved.state && saved.state.winner === -1);
    $('btn-continue').hidden = !resumable;
    $('btn-ai').classList.toggle('primary', !resumable);
    if (resumable) {
      const round = Math.min(R.ROUND_LIMIT, Math.floor(saved.state.ply / 2) + 1);
      $('continue-sub').textContent = (saved.mode === 'ai' ? 'vs Computer' : 'Two players') + ' · Round ' + round;
    }
    $('ai-sub').textContent = levelLabel(currentLevel()) + (settings.levelMode === 'adaptive' ? ' · adapts to you' : '');
    $('record').textContent = progress.played
      ? 'You’ve won ' + progress.won + ' of ' + progress.played + ' against the computer' + (progress.streak > 1 ? ' · ' + progress.streak + ' in a row' : '')
      : '';
  }

  function renderRules() {
    document.querySelectorAll('[data-diagram]').forEach(slot => {
      if (slot.dataset.drawn) return;
      const d = DIAGRAMS[slot.dataset.diagram];
      BoardView.diagram(slot, d.rows, d.marks, d.nerve, d.label);
      slot.dataset.drawn = '1';
    });
    $('rules-play').textContent = returnTo === 'game' ? 'Back to the game' : 'Play the computer';
  }

  function setSwitch(id, on) { $(id).setAttribute('aria-checked', on ? 'true' : 'false'); }
  function setSeg(id, value) {
    $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.v === String(value) ? 'true' : 'false'));
  }

  function renderSettings() {
    setSwitch('set-sound', settings.sound);
    setSwitch('set-hints', settings.hints);
    setSeg('set-theme', settings.theme);
    setSeg('set-levelmode', settings.levelMode);
    setSeg('set-clock', settings.clock);
    const lvl = currentLevel();
    $('level-out').textContent = levelLabel(lvl);
    $('level-down').disabled = lvl <= AI.MIN_LEVEL;
    $('level-up').disabled = lvl >= AI.MAX_LEVEL;
    $('level-help').textContent = settings.levelMode === 'adaptive'
      ? 'Adaptive: one level harder after you win, one easier after you lose. Use the buttons to pick where it starts.'
      : 'Always plays at the level you pick.';
    $('record-detail').textContent = progress.played
      ? 'Won ' + progress.won + ' of ' + progress.played + ' against the computer. Best streak: ' + progress.bestStreak + '.'
      : 'No games against the computer yet.';
  }

  // ---------------------------------------------------------------- starting and saving games
  function newGame(mode) {
    const first = progress.nextFirst[mode] === R.RED ? R.RED : R.BLUE;
    progress.nextFirst[mode] = 1 - first;
    Store.saveProgress(progress);
    G = {
      mode: mode,
      state: R.newGame({ first: first }),
      history: [],
      level: mode === 'ai' ? currentLevel() : 0,
      clocks: mode === 'pvp' && settings.clock ? [settings.clock * 1000, settings.clock * 1000] : null,
      finished: false,
      outcome: null
    };
    enterGame();
    if (mode === 'ai' && first !== HUMAN) toast('The computer opens this game');
    else if (mode === 'pvp') toast(R.PLAYER_NAMES[first] + ' opens this game');
  }

  function continueGame() {
    const saved = Store.loadGame();
    if (!saved) return renderMenu();
    try {
      G = {
        mode: saved.mode === 'pvp' ? 'pvp' : 'ai',
        state: R.deserialize(saved.state),
        history: Array.isArray(saved.history) ? saved.history : [],
        level: saved.level || currentLevel(),
        clocks: Array.isArray(saved.clocks) ? saved.clocks.slice() : null,
        finished: false,
        outcome: null
      };
    } catch (e) {
      Store.clearGame();
      return renderMenu();
    }
    enterGame();
  }

  function enterGame() {
    hideGameOver();
    aiTicket++;
    phase = 'idle';
    selected = preview = -1;
    $('banner').hidden = true;
    document.querySelectorAll('.meter').forEach(m => m.classList.remove('shattered'));
    view.reset(G.state);
    returnTo = 'game';
    show('game');
    persist();
    beginTurn();
  }

  function leaveGame() {
    persist();
    aiTicket++;
    stopClock();
    G = null;
    phase = 'idle';
    showCoach(null);
    returnTo = 'menu';
    show('menu');
  }

  function snapshot() {
    return { state: R.serialize(G.state), clocks: G.clocks ? G.clocks.slice() : null };
  }

  function persist() {
    if (!G || G.finished) return;
    Store.saveGame({ mode: G.mode, state: R.serialize(G.state), history: G.history.slice(-120), level: G.level, clocks: G.clocks });
  }

  // ---------------------------------------------------------------- turn flow
  function beginTurn() {
    if (!G) return;
    if (G.state.winner !== -1) return finishGame();
    if (isComputerTurn()) return computerTurn();
    phase = 'idle';
    render();
    startClock();
    coach();
    const me = G.state.turn, crown = R.crownSquare(G.state, me);
    if (crown >= 0 && R.isAttackedBy(G.state, crown, 1 - me)) Sound.play('alert');
  }

  function computerTurn() {
    phase = 'thinking';
    showCoach(null);
    render();
    const ticket = ++aiTicket, started = now(), think = 450 + Math.random() * 450;
    const state = G.state, level = G.level;
    askComputer(state, level, result => {
      if (ticket !== aiTicket || !G || G.state !== state) return;
      let move = result && typeof result.move === 'number' ? result.move : -1;
      if (!R.isLegal(state, move)) move = R.moves(state)[0];
      setTimeout(() => {
        if (ticket === aiTicket && G && G.state === state) playMove(move);
      }, Math.max(0, think - (now() - started)));
    });
  }

  function askComputer(state, level, cb) {
    const req = { state: state, level: level, cb: cb };
    const w = getWorker();
    if (w) {
      const id = ++askComputer.seq;
      pending.set(id, req);
      try {
        w.postMessage({ id: id, state: R.serialize(state), level: level, seed: (Math.random() * 4294967296) >>> 0 });
        return;
      } catch (e) {
        pending.delete(id);
        disableWorker();
      }
    }
    runLocally(req);
  }
  askComputer.seq = 0;

  function getWorker() {
    if (worker || workerFailed || typeof Worker === 'undefined') return worker;
    try {
      worker = new Worker('src/ai-worker.js');
      worker.onmessage = e => {
        const data = e.data || {}, req = pending.get(data.id);
        if (!req) return;
        pending.delete(data.id);
        if (data.error) runLocally(req);
        else req.cb(data.result);
      };
      worker.onerror = e => {
        if (e && e.preventDefault) e.preventDefault();
        disableWorker();
      };
    } catch (e) {
      disableWorker();
    }
    return worker;
  }

  // Without a worker (opened from a file, or blocked) the computer thinks on the page itself.
  function disableWorker() {
    workerFailed = true;
    if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } }
    worker = null;
    const waiting = Array.from(pending.values());
    pending.clear();
    waiting.forEach(runLocally);
  }

  function runLocally(req) {
    setTimeout(() => req.cb(AI.chooseMove(req.state, { level: req.level })), 30);
  }

  const hooks = {
    sound: name => Sound.play(name),
    haptic: haptic,
    sparkTarget: p => $('meter-' + p),
    onStress: e => bumpMeter(e.player, e.total),
    onSuddenDeath: () => { banner('Sudden death: next hit wins'); Sound.play('alert'); }
  };

  async function playMove(m) {
    if (!G || G.finished || !R.isLegal(G.state, m)) return;
    phase = 'animating';
    stopClock();
    if (coachKey) dismissCoach();
    selected = preview = -1;
    const before = G.state;
    G.history.push(snapshot());
    const result = R.apply(before, m);
    render();
    await view.animate(result.events, hooks);
    if (!G || G.state !== before) return; // left the game or undid during the animation
    G.state = result.state;
    persist();
    beginTurn();
  }

  // ---------------------------------------------------------------- input
  function onCell(sq) {
    Sound.unlock();
    if (!G || G.finished || phase !== 'idle') return;
    const st = G.state, me = st.turn;
    if (G.mode === 'ai' && me !== HUMAN) return;
    if (selected >= 0 && st.owner[sq] !== me) {
      const m = R.makeMove(selected, sq);
      if (R.isLegal(st, m)) { playMove(m); return; }
    }
    if (st.owner[sq] === me) {
      selected = selected === sq ? -1 : sq;
      preview = -1;
      if (selected >= 0) {
        Sound.play('select');
        if (coachKey === 'select') dismissCoach();
      }
    } else if (st.owner[sq] === 1 - me) {
      preview = preview === sq ? -1 : sq;
      selected = -1;
    } else {
      selected = preview = -1;
    }
    render();
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (!$('gameover').hidden) return;
    if (screen === 'game' && (selected >= 0 || preview >= 0)) { selected = preview = -1; render(); }
    else if (screen === 'rules' || screen === 'settings') show(returnTo === 'game' && G ? 'game' : 'menu');
  }

  // Highlights for the board: legal moves of the picked-up piece, with risk hints.
  function computeMarks() {
    const st = G.state;
    const marks = {
      selected: selected, moves: new Map(), preview: new Set(), previewFrom: preview,
      last: st.lastMove >= 0 ? [R.moveFrom(st.lastMove), R.moveTo(st.lastMove)] : null,
      alert: -1, interactive: phase === 'idle' && st.winner === -1 && !isComputerTurn()
    };
    if (selected >= 0 && st.owner[selected] === st.turn) {
      const me = st.turn;
      for (const to of R.pieceTargets(st, selected)) {
        const info = { capture: st.owner[to] !== -1, risk: false, danger: false };
        if (settings.hints) {
          const work = R.clone(st);
          R.play(work, R.makeMove(selected, to));
          if (work.winner === 1 - me) info.danger = true;
          else if (work.winner === -1) {
            const crown = R.crownSquare(work, me);
            info.danger = crown >= 0 && R.isAttackedBy(work, crown, 1 - me);
            info.risk = work.owner[to] === me && R.isAttackedBy(work, to, 1 - me);
          }
        }
        marks.moves.set(to, info);
      }
    }
    if (preview >= 0 && st.owner[preview] !== -1) R.pieceTargets(st, preview).forEach(sq => marks.preview.add(sq));
    if (st.winner === -1 && marks.interactive) {
      const crown = R.crownSquare(st, st.turn);
      if (crown >= 0 && R.isAttackedBy(st, crown, 1 - st.turn)) marks.alert = crown;
    }
    return marks;
  }

  // ---------------------------------------------------------------- drawing the game screen
  function render() {
    if (!G || !view) return;
    view.sync(G.state, computeMarks());
    renderPanels();
    renderTop();
    renderStatus();
    renderClocks();
    $('btn-undo').disabled = phase === 'animating' || undoIndex() < 0;
    $('btn-hints').setAttribute('aria-pressed', settings.hints ? 'true' : 'false');
  }

  function ensureMeter(el) {
    if (el.children.length === 10) return;
    el.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const seg = document.createElement('i');
      seg.className = 'l' + (i <= 3 ? 1 : i <= 6 ? 2 : i <= 9 ? 3 : 4);
      el.appendChild(seg);
    }
  }

  function paintMeter(p, stress, incoming) {
    const el = $('meter-' + p);
    ensureMeter(el);
    const segs = el.children;
    for (let i = 0; i < 10; i++) {
      segs[i].classList.toggle('on', i < stress);
      segs[i].classList.toggle('ghost', i >= stress && i < stress + incoming);
    }
    el.setAttribute('aria-valuenow', stress);
    el.setAttribute('aria-label', playerName(p) + ' Stress: ' + stress + ' of 10' + (incoming ? ', ' + incoming + ' more on the way' : ''));
  }

  function bumpMeter(p, total) {
    const el = $('meter-' + p);
    ensureMeter(el);
    const shown = Math.min(10, total);
    for (let i = 0; i < 10; i++) {
      const seg = el.children[i], was = seg.classList.contains('on');
      seg.classList.toggle('on', i < shown);
      seg.classList.remove('ghost');
      if (!was && i < shown) { seg.classList.remove('bump'); void seg.offsetWidth; seg.classList.add('bump'); }
    }
    $('stress-' + p).textContent = shown;
    haptic(14);
  }

  function renderPanels() {
    const st = G.state;
    for (const p of [R.BLUE, R.RED]) {
      const stress = Math.min(st.stress[p], R.STRESS_LIMIT);
      const incoming = st.winner === -1 ? Math.min(R.pendingHits(st, p), R.STRESS_LIMIT - stress) : 0;
      $('panel-' + p).classList.toggle('active', st.winner === -1 && st.turn === p);
      $('name-' + p).textContent = playerName(p);
      $('stress-' + p).textContent = stress;
      paintMeter(p, stress, incoming);
      const inc = $('incoming-' + p);
      inc.textContent = incoming ? '+' + incoming + ' incoming' : '';
      inc.title = incoming
        ? (incoming === 1 ? 'A raider is' : incoming + ' raiders are') + ' in ' + (G.mode === 'ai' && p === HUMAN ? 'your' : R.PLAYER_NAMES[p] + '’s') + ' half. Each hits for 1 at the start of its owner’s turn.'
        : '';
    }
  }

  function renderTop() {
    const st = G.state;
    $('mode-label').textContent = G.mode === 'ai' ? 'vs Computer · ' + levelLabel(G.level) : 'Two players';
    const rl = $('round-label');
    rl.classList.toggle('sudden', st.suddenDeath && st.winner === -1);
    rl.textContent = st.suddenDeath && st.winner === -1 ? 'Sudden death: next hit wins' : 'Round ' + Math.min(R.round(st), R.ROUND_LIMIT) + ' of ' + R.ROUND_LIMIT;
  }

  function renderStatus() {
    const st = G.state, el = $('status');
    let text = '', warn = false;
    if (st.winner === -1) {
      const me = st.turn;
      if (isComputerTurn()) text = 'The computer is thinking…';
      else {
        text = G.mode === 'ai' ? 'Your turn' : R.PLAYER_NAMES[me] + '’s turn';
        const crown = R.crownSquare(st, me), incoming = R.pendingHits(st, me);
        if (crown >= 0 && R.isAttackedBy(st, crown, 1 - me)) {
          text = (G.mode === 'ai' ? 'Your' : R.PLAYER_NAMES[me] + '’s') + ' Crown is under attack!';
          warn = true;
        } else if (incoming && st.stress[me] + incoming >= R.STRESS_LIMIT) {
          text = 'Those raiders will crack ' + (G.mode === 'ai' ? 'you' : R.PLAYER_NAMES[me]) + ' next turn. Capture one!';
          warn = true;
        } else if (selected >= 0) {
          text = R.PIECE_NAMES[st.type[selected]] + ': tap a marked square';
        } else if (preview >= 0) {
          text = 'Showing where that ' + R.PIECE_NAMES[st.type[preview]] + ' can go';
        }
      }
    }
    el.textContent = text;
    el.classList.toggle('warn', warn);
  }

  // ---------------------------------------------------------------- two-player clock
  function fmtClock(ms) {
    const s = Math.ceil(Math.max(0, ms) / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function renderClocks() {
    for (const p of [R.BLUE, R.RED]) {
      const el = $('clock-' + p);
      el.hidden = !(G && G.clocks);
      if (G && G.clocks) {
        el.textContent = fmtClock(G.clocks[p]);
        el.classList.toggle('low', G.clocks[p] < 20000);
      }
    }
  }
  function startClock() {
    stopClock();
    if (!G || !G.clocks || G.finished || screen !== 'game' || document.hidden) return;
    clockLast = now();
    clockTimer = setInterval(tickClock, 250);
  }
  function stopClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  }
  function tickClock() {
    if (!G || !G.clocks || G.finished || phase !== 'idle') return stopClock();
    const t = now(), p = G.state.turn;
    G.clocks[p] -= t - clockLast;
    clockLast = t;
    if (G.clocks[p] <= 0) {
      G.clocks[p] = 0;
      stopClock();
      G.state = R.forfeit(G.state, p, 'time');
      render();
      finishGame();
      return;
    }
    const sec = Math.ceil(G.clocks[p] / 1000);
    if (sec <= 10 && sec !== lastWarnSecond) { lastWarnSecond = sec; Sound.play('tick'); }
    renderClocks();
  }

  // ---------------------------------------------------------------- undo
  function undoIndex() {
    if (!G) return -1;
    for (let i = G.history.length - 1; i >= 0; i--) {
      if (G.mode === 'pvp' || G.history[i].state.turn === HUMAN) return i;
    }
    return -1;
  }

  function undo() {
    if (!G || phase === 'animating') return;
    const idx = undoIndex();
    if (idx < 0) return;
    const snap = G.history[idx];
    G.history.length = idx;
    if (G.finished && G.outcome) {
      progress = G.outcome.progress;
      Store.saveProgress(progress);
    }
    aiTicket++;
    G.state = R.deserialize(snap.state);
    if (snap.clocks) G.clocks = snap.clocks.slice();
    G.finished = false;
    G.outcome = null;
    hideGameOver();
    phase = 'idle';
    selected = preview = -1;
    $('banner').hidden = true;
    document.querySelectorAll('.meter').forEach(m => m.classList.remove('shattered'));
    view.reset(G.state);
    persist();
    Sound.play('select');
    beginTurn();
  }

  // ---------------------------------------------------------------- end of the game
  function finishGame() {
    if (!G || G.finished) return;
    G.finished = true;
    phase = 'idle';
    stopClock();
    selected = preview = -1;
    showCoach(null);
    render();
    const st = G.state, w = st.winner;
    let levelLine = '';
    if (G.mode === 'ai') {
      G.outcome = { progress: JSON.parse(JSON.stringify(progress)) };
      progress.played++;
      if (w === HUMAN) {
        progress.won++;
        progress.streak++;
        progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
      } else progress.streak = 0;
      if (settings.levelMode === 'adaptive' && w !== R.DRAW) {
        const before = progress.level;
        progress.level = Math.max(AI.MIN_LEVEL, Math.min(AI.MAX_LEVEL, before + (w === HUMAN ? 1 : -1)));
        levelLine = progress.level === before
          ? 'Next game: ' + levelLabel(before) + ' again'
          : 'Next game: ' + levelLabel(progress.level) + (progress.level > before ? ', one step harder' : ', one step easier');
      }
      Store.saveProgress(progress);
    }
    Store.clearGame();
    if (st.reason === 'stress' || st.reason === 'sudden-death' || st.reason === 'limit') {
      if (w !== R.DRAW) $('meter-' + (1 - w)).classList.add('shattered');
      Sound.play('shatter');
      haptic([40, 60, 40]);
    }
    const won = G.mode === 'pvp' || w === HUMAN;
    setTimeout(() => Sound.play(won && w !== R.DRAW ? 'win' : 'lose'), reducedMotion() ? 0 : 450);
    setTimeout(() => { if (G && G.finished) showGameOver(levelLine); }, reducedMotion() ? 150 : 1000);
  }

  function reasonText(st) {
    const w = st.winner, l = 1 - w;
    const lower = p => (G.mode === 'ai' ? (p === HUMAN ? 'you' : 'the computer') : R.PLAYER_NAMES[p]);
    switch (st.reason) {
      case 'stress': return subject(l) + ' cracked under pressure.';
      case 'crown':
        if (G.mode === 'ai') return w === HUMAN ? 'You captured the computer\u2019s Crown.' : 'The computer captured your Crown.';
        return R.PLAYER_NAMES[w] + ' captured ' + R.PLAYER_NAMES[l] + '\u2019s Crown.';
      case 'limit': return 'After ' + R.ROUND_LIMIT + ' rounds, ' + lower(w) + ' stayed calmer: ' + st.stress[w] + ' Stress to ' + st.stress[l] + '.';
      case 'sudden-death': return 'Sudden death: ' + lower(l) + ' took the next hit.';
      case 'stuck': return subject(l) + ' had no moves left.';
      case 'time': return subject(l) + ' ran out of time.';
      case 'pieces': return 'Sudden death ran long, so the side with more pieces left wins.';
      case 'draw': return 'Nobody could break through.';
      default: return '';
    }
  }

  function showGameOver(levelLine) {
    const st = G.state, w = st.winner;
    const title = $('go-title');
    if (w === R.DRAW) title.textContent = 'A draw';
    else if (G.mode === 'ai') title.textContent = w === HUMAN ? 'You win!' : 'The computer wins';
    else title.textContent = R.PLAYER_NAMES[w] + ' wins!';
    title.className = w === R.DRAW ? '' : w === R.BLUE ? 'blue' : 'red';
    $('go-eyebrow').textContent = G.mode === 'ai' ? 'vs Computer · ' + levelLabel(G.level) : 'Two players';
    $('go-reason').textContent = reasonText(st);
    const pair = (a, b) => a + ' – ' + b;
    const stats = [
      ['Moves', String(st.ply)],
      ['Stress', pair(st.stress[R.BLUE], st.stress[R.RED])],
      ['Captures', pair(st.captures[R.BLUE], st.captures[R.RED])]
    ];
    const dl = $('go-stats');
    dl.innerHTML = '';
    stats.forEach(([k, v]) => {
      const box = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      box.append(dt, dd);
      dl.appendChild(box);
    });
    dl.title = G.mode === 'ai' ? 'You – Computer' : 'Blue – Red';
    $('go-level').textContent = levelLine;
    $('go-undo').hidden = undoIndex() < 0;
    $('gameover').hidden = false;
    $('go-again').focus({ preventScroll: true });
  }

  function hideGameOver() {
    $('gameover').hidden = true;
  }

  // ---------------------------------------------------------------- first-game tips
  function coach() {
    if (!G || G.mode !== 'ai' || G.finished || G.state.turn !== HUMAN || phase !== 'idle') return showCoach(null);
    const seen = progress.coach, st = G.state;
    let key = null;
    if (!seen.select) key = 'select';
    else if (!seen.capture && R.moves(st).some(m => st.owner[R.moveTo(m)] !== -1)) key = 'capture';
    else if (!seen.raid && (hasRaider(st, R.BLUE) || hasRaider(st, R.RED))) key = 'raid';
    else if (!seen.nerve && lastNerveRaider(st)) key = 'nerve';
    else if (!seen.win && Math.max(st.stress[0], st.stress[1]) >= 4) key = 'win';
    showCoach(key);
  }
  function hasRaider(st, p) {
    for (let sq = 0; sq < R.CELLS; sq++) if (st.owner[sq] === p && R.inEnemyHalf(sq, p)) return true;
    return false;
  }
  function lastNerveRaider(st) {
    for (let sq = 0; sq < R.CELLS; sq++) if (st.owner[sq] === HUMAN && R.nerveLeft(st, sq) === 1) return true;
    return false;
  }
  function showCoach(key) {
    coachKey = key;
    $('coach').hidden = !key;
    $('status').hidden = !!key;
    if (key) $('coach-text').textContent = TIPS[key];
  }
  function dismissCoach() {
    if (!coachKey) return;
    progress.coach[coachKey] = true;
    Store.saveProgress(progress);
    showCoach(null);
  }

  // ---------------------------------------------------------------- wiring
  function bind() {
    view = new BoardView($('board'), { onCell: onCell });
    BoardView.diagram($('menu-art'), MENU_ART.rows, {}, MENU_ART.nerve, 'A game of Stress in progress');

    $('btn-ai').addEventListener('click', () => { Sound.unlock(); newGame('ai'); });
    $('btn-pvp').addEventListener('click', () => { Sound.unlock(); newGame('pvp'); });
    $('btn-continue').addEventListener('click', () => { Sound.unlock(); continueGame(); });
    $('btn-rules').addEventListener('click', () => { returnTo = 'menu'; show('rules'); });
    $('btn-settings').addEventListener('click', () => { returnTo = 'menu'; show('settings'); });

    $('btn-back').addEventListener('click', leaveGame);
    $('btn-help').addEventListener('click', () => { returnTo = 'game'; show('rules'); });
    $('btn-sound').addEventListener('click', () => {
      settings.sound = !settings.sound;
      Sound.setEnabled(settings.sound);
      saveSettings();
      $('btn-sound').setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
      if (settings.sound) Sound.play('select');
    });
    $('btn-undo').addEventListener('click', undo);
    $('btn-hints').addEventListener('click', () => {
      settings.hints = !settings.hints;
      saveSettings();
      render();
      toast(settings.hints ? 'Hints on' : 'Hints off');
    });
    $('coach-ok').addEventListener('click', () => { dismissCoach(); coach(); });

    const back = () => show(returnTo === 'game' && G ? 'game' : 'menu');
    $('rules-back').addEventListener('click', back);
    $('settings-back').addEventListener('click', back);
    $('rules-play').addEventListener('click', () => { if (returnTo === 'game' && G) show('game'); else newGame('ai'); });

    $('set-sound').addEventListener('click', () => {
      settings.sound = !settings.sound;
      Sound.setEnabled(settings.sound);
      $('btn-sound').setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
      saveSettings();
      renderSettings();
    });
    $('set-hints').addEventListener('click', () => { settings.hints = !settings.hints; saveSettings(); renderSettings(); });
    $('set-theme').addEventListener('click', e => {
      const v = e.target.closest('button') && e.target.closest('button').dataset.v;
      if (!v) return;
      settings.theme = v;
      applyTheme();
      saveSettings();
      renderSettings();
    });
    $('set-levelmode').addEventListener('click', e => {
      const v = e.target.closest('button') && e.target.closest('button').dataset.v;
      if (!v) return;
      if (v === 'fixed' && settings.levelMode !== 'fixed') settings.fixedLevel = progress.level;
      settings.levelMode = v;
      saveSettings();
      renderSettings();
    });
    const step = d => {
      if (settings.levelMode === 'fixed') settings.fixedLevel = Math.max(AI.MIN_LEVEL, Math.min(AI.MAX_LEVEL, settings.fixedLevel + d));
      else { progress.level = Math.max(AI.MIN_LEVEL, Math.min(AI.MAX_LEVEL, progress.level + d)); Store.saveProgress(progress); }
      saveSettings();
      renderSettings();
    };
    $('level-down').addEventListener('click', () => step(-1));
    $('level-up').addEventListener('click', () => step(1));
    $('set-clock').addEventListener('click', e => {
      const v = e.target.closest('button') && e.target.closest('button').dataset.v;
      if (v === undefined || v === null) return;
      settings.clock = Number(v);
      saveSettings();
      renderSettings();
    });
    $('reset-tips').addEventListener('click', () => { progress.coach = {}; Store.saveProgress(progress); toast('Tips will show again in your next game'); });
    $('reset-stats').addEventListener('click', () => {
      const btn = $('reset-stats');
      if (Date.now() - resetArmedAt < 3000) {
        resetArmedAt = 0;
        Object.assign(progress, { played: 0, won: 0, streak: 0, bestStreak: 0, level: Store.DEFAULT_PROGRESS.level });
        Store.saveProgress(progress);
        btn.textContent = 'Reset';
        renderSettings();
        toast('Record reset');
      } else {
        resetArmedAt = Date.now();
        btn.textContent = 'Tap again to reset';
        setTimeout(() => { if (Date.now() - resetArmedAt >= 2900) btn.textContent = 'Reset'; }, 3000);
      }
    });

    $('go-again').addEventListener('click', () => newGame(G ? G.mode : 'ai'));
    $('go-undo').addEventListener('click', undo);
    $('go-menu').addEventListener('click', () => { hideGameOver(); leaveGame(); });

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stopClock(); persist(); }
      else if (G && screen === 'game' && phase === 'idle' && !G.finished) startClock();
    });
    window.addEventListener('pagehide', persist);
  }

  function init() {
    applyTheme();
    Sound.setEnabled(settings.sound);
    $('btn-sound').setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
    bind();
    show('menu');
  }

  init();
})();
