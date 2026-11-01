/* The match controller: one game on the game screen, in any mode.
   Modes: 'rival' and 'quick' (you vs the computer), 'pvp' (pass and play),
   'puzzle' (win in N against the solver's best defense). */
(function (root) {
  'use strict';
  const R = root.StressRules, AI = root.StressAI, Art = root.StressArt, Icons = root.StressIcons;
  const Sound = root.StressSound, Haptics = root.StressHaptics, BoardView = root.StressBoardView;
  const $ = id => document.getElementById(id);
  const now = () => (root.performance ? performance.now() : Date.now());
  const HUMAN = R.BLUE;

  let app = null, view = null, M = null; // M: the match in progress
  let phase = 'idle'; // idle | animating | thinking
  let selected = -1, preview = -1, hint = null;
  let ticket = 0, worker = null, workerFailed = false, seq = 0;
  const pending = new Map();
  let clockTimer = null, clockLast = 0, lastWarn = -1, sayTimer = null, bannerTimer = null;

  // ---------------------------------------------------------------- worker
  function getWorker() {
    if (worker || workerFailed || typeof Worker === 'undefined') return worker;
    try {
      worker = new Worker('src/ai-worker.js');
      worker.onmessage = e => {
        const d = e.data || {}, req = pending.get(d.id);
        if (!req) return;
        pending.delete(d.id);
        if (d.error) runLocal(req); else req.cb(d.result);
      };
      worker.onerror = e => { if (e && e.preventDefault) e.preventDefault(); dropWorker(); };
    } catch (err) { dropWorker(); }
    return worker;
  }
  function dropWorker() {
    workerFailed = true;
    if (worker) { try { worker.terminate(); } catch (e) { /* gone */ } }
    worker = null;
    const waiting = Array.from(pending.values());
    pending.clear();
    waiting.forEach(runLocal);
  }
  // Without a worker (opened from a file, or blocked) everything runs on the page.
  function runLocal(req) {
    setTimeout(() => {
      const st = R.deserialize(req.msg.state), S = root.StressSolver;
      if (req.msg.kind === 'defend') req.cb(S.bestDefense(st, req.msg.movesLeft, 3e6));
      else if (req.msg.kind === 'hint') req.cb({ moves: S.winningMoves(st, req.msg.movesLeft, 3e6) });
      else req.cb(AI.chooseMove(st, { level: req.msg.level, style: req.msg.style, budgetMs: req.msg.budget }));
    }, 30);
  }
  function ask(msg, cb) {
    msg.state = R.serialize(msg.state);
    const req = { msg, cb }, w = getWorker();
    if (w) {
      const id = ++seq;
      pending.set(id, req);
      try { w.postMessage(Object.assign({ id }, msg)); return; } catch (e) { pending.delete(id); dropWorker(); }
    }
    runLocal(req);
  }

  // ---------------------------------------------------------------- helpers
  const vsComputer = () => M && (M.mode === 'rival' || M.mode === 'quick');
  const isComputerTurn = () => !!M && M.state.winner === -1 && M.state.turn !== HUMAN && (vsComputer() || M.mode === 'puzzle');
  const nameOf = p => (p === HUMAN && M.mode !== 'pvp' ? 'You' : M.opponent ? M.opponent.short || M.opponent.name : R.PLAYER_NAMES[p]);
  const reduced = () => !!(root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function say(text, ms) {
    const el = $('opp-say');
    if (!text || M.mode === 'pvp') return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { el.hidden = true; }, ms || 1900);
  }
  function banner(text, ms) {
    const el = $('banner');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.hidden = true; }, ms || 1700);
  }
  function oppMood(mood) {
    if (!M.opponent) return;
    $('opp-face').innerHTML = M.opponent.art(mood);
  }
  function restingOppMood() {
    const st = M.state, me = 1 - HUMAN;
    if (st.winner !== -1) return st.winner === me ? 'happy' : 'sad';
    const crown = R.crownSquare(st, me);
    if (crown >= 0 && R.isAttackedBy(st, crown, HUMAN)) return 'panic';
    if (st.stress[me] >= 7) return 'nervous';
    if (st.stress[HUMAN] >= 7) return 'focus';
    return 'calm';
  }

  // ---------------------------------------------------------------- starting
  /**
   * cfg: { mode, state, opponent?: { name, short, art(mood), lines, level, style, budget, id },
   *        puzzle?: { id, n, daily, solution }, clocks?, history?, stats?, onFinish(result, match) }
   */
  function start(cfg) {
    app = cfg.app;
    if (!view) view = new BoardView($('board'), { onCell });
    ticket++;
    M = {
      mode: cfg.mode,
      state: cfg.state,
      start: R.serialize(cfg.state),
      opponent: cfg.opponent || null,
      puzzle: cfg.puzzle || null,
      movesLeft: cfg.puzzle ? cfg.puzzle.n : 0,
      hinted: false,
      clocks: cfg.clocks || null,
      history: cfg.history || [],
      stats: cfg.stats || { peak: [0, 0], maxRaid: 0, myMoves: 0 },
      finished: false,
      onFinish: cfg.onFinish
    };
    phase = 'idle';
    selected = preview = -1;
    hint = null;
    $('banner').hidden = true;
    $('opp-say').hidden = true;
    document.querySelectorAll('#screen-game .meter').forEach(m => m.classList.remove('shattered'));
    view.reset(M.state, { threats: app.settings.hints });
    labelSides();
    render();
    persist();
    if (cfg.greet !== false && M.opponent) setTimeout(() => say(M.opponent.lines.hello, 2200), 350);
    beginTurn();
  }

  function labelSides() {
    const opp = M.opponent;
    $('opp-name').firstChild.textContent = M.mode === 'pvp' ? 'Red' : M.mode === 'puzzle' ? 'Red' : (opp.short || opp.name);
    $('me-name').firstChild.textContent = M.mode === 'pvp' ? 'Blue' : 'You';
    $('me-face').innerHTML = Art.piece(R.CROWN, R.BLUE, 'calm');
    if (M.mode === 'pvp' || M.mode === 'puzzle') $('opp-face').innerHTML = Art.piece(R.CROWN, R.RED, 'calm');
    else oppMood(restingOppMood()); // a resumed game shows how rattled they already are
    const title = $('g-title');
    if (M.mode === 'rival') title.textContent = 'vs ' + opp.name;
    else if (M.mode === 'quick') title.textContent = 'Quick match · Level ' + opp.level;
    else if (M.mode === 'pvp') title.textContent = 'Two players';
    else title.textContent = M.puzzle.daily ? 'Daily puzzle' : 'Puzzle ' + M.puzzle.label;
    $('btn-undo').hidden = M.mode === 'puzzle';
    $('btn-reset').hidden = M.mode !== 'puzzle';
    $('btn-hint').hidden = M.mode !== 'puzzle';
    $('btn-hints').hidden = M.mode === 'puzzle';
  }

  function persist() {
    if (!M || M.finished || M.mode === 'puzzle') return;
    app.store.saveGame({
      mode: M.mode, state: R.serialize(M.state), history: M.history.slice(-120), clocks: M.clocks, stats: M.stats,
      opponent: M.opponent ? { id: M.opponent.id, level: M.opponent.level } : null
    });
  }

  function stop() {
    persist();
    ticket++;
    stopClock();
    phase = 'idle';
    M = null;
  }

  // ---------------------------------------------------------------- turns
  function beginTurn() {
    if (!M) return;
    if (M.state.winner !== -1) return finish();
    if (isComputerTurn()) return computerTurn();
    phase = 'idle';
    render();
    startClock();
    const me = M.state.turn, crown = R.crownSquare(M.state, me);
    if (crown >= 0 && R.isAttackedBy(M.state, crown, 1 - me)) { Sound.play('alert'); Haptics.play('warning'); }
    if (vsComputer()) tips();
  }

  function computerTurn() {
    phase = 'thinking';
    render();
    const t = ++ticket, started = now(), state = M.state;
    if (M.mode === 'puzzle') {
      // Red plays the solver's most stubborn defense (found while checking your move).
      const move = typeof M.defense === 'number' && R.isLegal(state, M.defense) ? M.defense : R.moves(state)[0];
      M.defense = null;
      setTimeout(() => { if (t === ticket && M && M.state === state) playMove(move); }, 420);
      return;
    }
    const think = 450 + Math.random() * 450, opp = M.opponent;
    ask({ kind: 'move', state, level: opp.level, style: opp.style, budget: opp.budget }, res => {
      if (t !== ticket || !M || M.state !== state) return;
      let move = res && typeof res.move === 'number' ? res.move : -1;
      if (!R.isLegal(state, move)) move = R.moves(state)[0];
      setTimeout(() => { if (t === ticket && M && M.state === state) playMove(move); }, Math.max(0, think - (now() - started)));
    });
  }

  const hooks = {
    sound: n => Sound.play(n),
    haptic: k => Haptics.play(k),
    sparkTarget: p => $('meter-' + p),
    onStress: (e, raiders) => {
      bumpMeter(e.player, e.total);
      if (e.player !== HUMAN && raiders) M.stats.maxRaid = Math.max(M.stats.maxRaid, raiders);
      M.stats.peak[e.player] = Math.max(M.stats.peak[e.player], e.total);
      if (vsComputer()) {
        if (e.player === HUMAN) { oppMood('happy'); say(M.opponent.lines.hit); }
        else { oppMood(e.total >= 7 ? 'nervous' : 'sad'); if (e.amount >= 2 || e.total >= 8) say(M.opponent.lines.hurt); }
      }
    },
    onCapture: e => {
      if (!vsComputer()) return;
      if (e.player === HUMAN) { oppMood('sad'); say(M.opponent.lines.hurt); }
      else { oppMood('happy'); say(M.opponent.lines.hit); }
    },
    onSuddenDeath: () => { banner('Sudden death: next hit wins'); Sound.play('alert'); }
  };

  async function playMove(m) {
    if (!M || M.finished || !R.isLegal(M.state, m)) return;
    phase = 'animating';
    stopClock();
    selected = preview = -1;
    hint = null;
    const before = M.state, mover = before.turn;
    if (M.mode !== 'puzzle') M.history.push({ state: R.serialize(before), clocks: M.clocks ? M.clocks.slice() : null, stats: JSON.parse(JSON.stringify(M.stats)) });
    if (mover === HUMAN) M.stats.myMoves++;
    const result = R.apply(before, m);
    render();
    await view.animate(result.events, hooks);
    if (!M || M.state !== before) return; // left or undid during the animation
    M.state = result.state;
    if (M.mode === 'puzzle' && mover === HUMAN && M.state.winner === -1) return puzzleCheck();
    if (M.mode === 'puzzle' && mover !== HUMAN) M.movesLeft--;
    if (vsComputer() && M.state.winner === -1) oppMood(restingOppMood());
    persist();
    beginTurn();
  }

  // After the player's move in a puzzle: is the win still forced?
  function puzzleCheck() {
    phase = 'thinking';
    render();
    const t = ++ticket, state = M.state;
    ask({ kind: 'defend', state, movesLeft: M.movesLeft - 1 }, res => {
      if (t !== ticket || !M || M.state !== state) return;
      if (!res || res.escapes) return puzzleFail();
      M.defense = res.move;
      beginTurn();
    });
  }

  function puzzleFail() {
    phase = 'idle';
    Sound.play('wrong');
    Haptics.play('warning');
    render();
    app.sheet(
      '<div class="prematch"><div class="big-portrait">' + Art.piece(R.CROWN, R.RED, 'happy') + '</div>' +
      '<h2>Not quite</h2><p class="muted">That move lets Red slip away. Try again from the start?</p>' +
      '<div class="sheet-actions"><button class="btn primary wide" data-act="retry">' + Icons.reset + 'Try again</button>' +
      '<button class="btn wide" data-act="hint">' + Icons.hint + 'Try again with a hint</button>' +
      '<button class="btn ghost wide" data-act="quit">Back to puzzles</button></div></div>',
      act => {
        if (act === 'retry') resetPuzzle(false);
        else if (act === 'hint') resetPuzzle(true);
        else app.closeMatch();
      }
    );
  }

  function resetPuzzle(withHint) {
    if (!M || M.mode !== 'puzzle') return;
    ticket++;
    M.state = R.deserialize(M.start);
    M.movesLeft = M.puzzle.n;
    phase = 'idle';
    selected = preview = -1;
    hint = null;
    view.reset(M.state, { threats: false });
    render();
    if (withHint) showHint();
  }

  function showHint() {
    if (!M || M.mode !== 'puzzle' || phase !== 'idle' || M.state.turn !== HUMAN) return;
    M.hinted = true;
    const atStart = M.movesLeft === M.puzzle.n && M.puzzle.solution;
    const apply = m => {
      hint = [R.moveFrom(m), R.moveTo(m)];
      selected = -1;
      render();
      Sound.play('pop');
    };
    if (atStart) return apply(R.makeMove(R.squareIndex(M.puzzle.solution.slice(0, 2)), R.squareIndex(M.puzzle.solution.slice(3))));
    phase = 'thinking';
    render();
    const t = ++ticket, state = M.state;
    ask({ kind: 'hint', state, movesLeft: M.movesLeft }, res => {
      if (t !== ticket || !M || M.state !== state) return;
      phase = 'idle';
      if (res && res.moves && res.moves.length) apply(res.moves[0]); else render();
    });
  }

  // ---------------------------------------------------------------- input
  function onCell(sq) {
    app.unlockAudio();
    if (!M || M.finished || phase !== 'idle') return;
    const st = M.state, me = st.turn;
    if (M.mode !== 'pvp' && me !== HUMAN) return;
    if (selected >= 0 && st.owner[sq] !== me) {
      const m = R.makeMove(selected, sq);
      if (R.isLegal(st, m)) { playMove(m); return; }
    }
    if (st.owner[sq] === me) {
      selected = selected === sq ? -1 : sq;
      preview = -1;
      if (selected >= 0) { Sound.play('select'); Haptics.play('select'); }
    } else if (st.owner[sq] === 1 - me) {
      preview = preview === sq ? -1 : sq;
      selected = -1;
    } else selected = preview = -1;
    render();
  }

  function computeMarks() {
    const st = M.state, me = st.turn;
    const marks = {
      selected, moves: new Map(), preview: new Set(), hint,
      last: st.lastMove >= 0 ? [R.moveFrom(st.lastMove), R.moveTo(st.lastMove)] : null,
      interactive: phase === 'idle' && st.winner === -1 && !isComputerTurn()
    };
    const hintsOn = app.settings.hints && M.mode !== 'puzzle';
    if (selected >= 0 && st.owner[selected] === me) {
      for (const to of R.pieceTargets(st, selected)) {
        const info = { capture: st.owner[to] !== -1, risk: false, danger: false };
        if (hintsOn) {
          const w = R.clone(st);
          R.play(w, R.makeMove(selected, to));
          if (w.winner === 1 - me) info.danger = true;
          else if (w.winner === -1) {
            const crown = R.crownSquare(w, me);
            info.danger = crown >= 0 && R.isAttackedBy(w, crown, 1 - me);
            info.risk = w.owner[to] === me && R.isAttackedBy(w, to, 1 - me);
          }
        }
        marks.moves.set(to, info);
      }
    }
    if (preview >= 0 && st.owner[preview] !== -1) R.pieceTargets(st, preview).forEach(s => marks.preview.add(s));
    return marks;
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    if (!M) return;
    const st = M.state, ended = st.winner !== -1 ? st.winner : -1;
    view.sync(st, computeMarks(), { threats: app.settings.hints && M.mode !== 'puzzle', ended });
    for (const p of [R.BLUE, R.RED]) {
      const side = $(p === HUMAN ? 'side-me' : 'side-opp');
      side.classList.toggle('active', st.winner === -1 && st.turn === p);
      const stress = Math.min(st.stress[p], R.STRESS_LIMIT);
      const incoming = st.winner === -1 ? Math.min(R.pendingHits(st, p), R.STRESS_LIMIT - stress) : 0;
      $((p === HUMAN ? 'me' : 'opp') + '-stress').textContent = stress;
      paintMeter(p, stress, incoming);
      $('inc-' + p).textContent = incoming ? '+' + incoming + ' incoming' : '';
    }
    // subtitle: round, or puzzle goal
    const sub = $('g-sub');
    sub.classList.remove('sudden');
    if (M.mode === 'puzzle') {
      sub.innerHTML = '';
      const goal = document.createElement('span');
      goal.className = 'goalbar';
      goal.innerHTML = 'Win in ' + M.puzzle.n + ' <span class="pips" aria-hidden="true">' + Array.from({ length: M.puzzle.n }, (_, i) => '<i class="' + (i < M.puzzle.n - M.movesLeft ? 'used' : '') + '"></i>').join('') + '</span>';
      sub.appendChild(goal);
    } else if (st.suddenDeath && st.winner === -1) {
      sub.textContent = 'Sudden death: next hit wins';
      sub.classList.add('sudden');
    } else sub.textContent = 'Round ' + Math.min(R.round(st), R.ROUND_LIMIT) + ' of ' + R.ROUND_LIMIT;
    $('btn-undo').disabled = phase === 'animating' || undoIndex() < 0;
    $('btn-hints').setAttribute('aria-pressed', app.settings.hints ? 'true' : 'false');
    $('btn-hint').disabled = phase !== 'idle' || st.turn !== HUMAN || st.winner !== -1;
    renderClocks();
    const me = $('me-face');
    me.innerHTML = Art.piece(R.CROWN, R.BLUE, ended === HUMAN ? 'happy' : ended >= 0 && ended !== HUMAN && ended !== R.DRAW ? 'sad' : st.stress[HUMAN] >= 7 ? 'nervous' : 'calm');
    if (M.mode === 'pvp' || M.mode === 'puzzle') $('opp-face').innerHTML = Art.piece(R.CROWN, R.RED, ended === R.RED ? 'happy' : ended === R.BLUE ? 'sad' : st.stress[R.RED] >= 7 ? 'nervous' : 'calm');
  }

  function paintMeter(p, stress, incoming) {
    const el = $('meter-' + p);
    if (el.children.length !== 10) {
      el.innerHTML = '';
      for (let i = 1; i <= 10; i++) { const seg = document.createElement('i'); seg.className = 'l' + (i <= 3 ? 1 : i <= 6 ? 2 : i <= 9 ? 3 : 4); el.appendChild(seg); }
    }
    for (let i = 0; i < 10; i++) {
      el.children[i].classList.toggle('on', i < stress);
      el.children[i].classList.toggle('ghost', i >= stress && i < stress + incoming);
    }
    el.classList.toggle('hot', stress >= 7);
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '10');
    el.setAttribute('aria-valuenow', stress);
    el.setAttribute('aria-label', nameOf(p) + ' Stress ' + stress + ' of 10' + (incoming ? ', ' + incoming + ' incoming' : ''));
  }

  function bumpMeter(p, total) {
    const el = $('meter-' + p), shown = Math.min(10, total);
    for (let i = 0; i < el.children.length; i++) {
      const seg = el.children[i], was = seg.classList.contains('on');
      seg.classList.toggle('on', i < shown);
      seg.classList.remove('ghost');
      if (!was && i < shown) { seg.classList.remove('bump'); void seg.offsetWidth; seg.classList.add('bump'); }
    }
    $((p === HUMAN ? 'me' : 'opp') + '-stress').textContent = shown;
  }

  // Contextual tips in your first few games, once each.
  function tips() {
    const seen = app.profile.seen, st = M.state;
    const tip = (key, text) => { if (!seen['tip-' + key]) { seen['tip-' + key] = true; app.saveProfile(); app.toast(text, 4200); return true; } return false; };
    for (let sq = 0; sq < R.CELLS; sq++) {
      if (st.owner[sq] === HUMAN && R.nerveLeft(st, sq) === 1 && tip('nerve', 'A raider on its last nerve looks nervous. Pull it back to refill, or it cracks after its next hit.')) return;
    }
    if (R.pendingHits(st, HUMAN) && tip('incoming', 'Red raiders in your half hit you at the start of Red’s turn. Capture them or take the Stress.')) return;
    const crown = R.crownSquare(st, HUMAN);
    if (crown >= 0 && R.isAttackedBy(st, crown, 1 - HUMAN)) tip('crown', 'Your Crown is under attack! Move it or block. Losing it loses the game.');
  }

  // ---------------------------------------------------------------- clock (two players)
  const fmt = ms => { const s = Math.ceil(Math.max(0, ms) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function renderClocks() {
    for (const p of [0, 1]) {
      const el = $('clock-' + p);
      el.hidden = !(M && M.clocks);
      if (M && M.clocks) { el.textContent = fmt(M.clocks[p]); el.classList.toggle('low', M.clocks[p] < 20000); }
    }
  }
  function startClock() {
    stopClock();
    if (!M || !M.clocks || M.finished || document.hidden) return;
    clockLast = now();
    clockTimer = setInterval(() => {
      if (!M || !M.clocks || M.finished || phase !== 'idle') return stopClock();
      const t = now(), p = M.state.turn;
      M.clocks[p] -= t - clockLast;
      clockLast = t;
      if (M.clocks[p] <= 0) {
        M.clocks[p] = 0;
        stopClock();
        M.state = R.forfeit(M.state, p, 'time');
        render();
        finish();
        return;
      }
      const sec = Math.ceil(M.clocks[p] / 1000);
      if (sec <= 10 && sec !== lastWarn) { lastWarn = sec; Sound.play('tick'); }
      renderClocks();
    }, 250);
  }
  function stopClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = null; }

  // ---------------------------------------------------------------- undo
  function undoIndex() {
    if (!M || M.mode === 'puzzle') return -1;
    for (let i = M.history.length - 1; i >= 0; i--) if (M.mode === 'pvp' || M.history[i].state.turn === HUMAN) return i;
    return -1;
  }
  function undo() {
    if (!M || phase === 'animating') return false;
    const i = undoIndex();
    if (i < 0) return false;
    const snap = M.history[i];
    M.history.length = i;
    ticket++;
    M.state = R.deserialize(snap.state);
    if (snap.clocks) M.clocks = snap.clocks.slice();
    if (snap.stats) M.stats = snap.stats;
    M.finished = false;
    phase = 'idle';
    selected = preview = -1;
    $('banner').hidden = true;
    document.querySelectorAll('#screen-game .meter').forEach(m => m.classList.remove('shattered'));
    view.reset(M.state, { threats: app.settings.hints });
    if (vsComputer()) oppMood(restingOppMood());
    persist();
    Sound.play('whoosh');
    beginTurn();
    return true;
  }

  // ---------------------------------------------------------------- the end
  function finish() {
    if (!M || M.finished) return;
    M.finished = true;
    phase = 'idle';
    stopClock();
    selected = preview = -1;
    render();
    const st = M.state, w = st.winner;
    if (M.mode !== 'puzzle') app.store.clearGame();
    const won = M.mode === 'pvp' ? w !== R.DRAW : w === HUMAN;
    if (st.reason === 'stress' || st.reason === 'sudden-death' || st.reason === 'limit') {
      if (w !== R.DRAW) $('meter-' + (1 - w)).classList.add('shattered');
      Sound.play('shatter');
      view.shake();
    }
    if (vsComputer()) { oppMood(w === HUMAN ? 'sad' : 'happy'); say(w === HUMAN ? M.opponent.lines.lose : M.opponent.lines.win, 2400); }
    Haptics.play(won ? 'success' : 'warning');
    const result = {
      mode: M.mode, won, winner: w, reason: st.reason, myStress: st.stress[HUMAN], theirStress: st.stress[1 - HUMAN],
      peakStress: Math.max(M.stats.peak[HUMAN], st.stress[HUMAN]), myMoves: M.stats.myMoves, raids: st.dealt[HUMAN],
      maxRaid: M.stats.maxRaid, captures: st.captures.slice(), plies: st.ply,
      rivalId: M.opponent && M.opponent.id, level: M.opponent && M.opponent.level,
      puzzleId: M.puzzle && M.puzzle.id, puzzleN: M.puzzle && M.puzzle.n, daily: !!(M.puzzle && M.puzzle.daily), hinted: M.hinted
    };
    const done = M.onFinish;
    setTimeout(() => { if (M && M.finished && done) done(result); }, reduced() ? 200 : M.mode === 'puzzle' ? 700 : 1300);
  }

  // ---------------------------------------------------------------- wiring
  function bind(appRef) {
    app = appRef;
    $('btn-undo').addEventListener('click', () => { if (undo()) app.toast('Took back your last move'); });
    $('btn-hints').addEventListener('click', () => {
      app.settings.hints = !app.settings.hints;
      app.saveSettings();
      render();
      app.toast(app.settings.hints ? 'Hints on: risky moves are marked' : 'Hints off');
    });
    $('btn-hint').addEventListener('click', showHint);
    $('btn-reset').addEventListener('click', () => resetPuzzle(false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stopClock(); persist(); }
      else if (M && phase === 'idle' && !M.finished && app.screen === 'game') startClock();
    });
    window.addEventListener('pagehide', persist);
  }

  root.StressMatch = {
    bind, start, stop, undo, render,
    canUndo: () => undoIndex() >= 0,
    get current() { return M; },
    resetPuzzle,
    pauseClock: stopClock,
    resumeClock: () => { if (M && phase === 'idle' && !M.finished) startClock(); }
  };
})(typeof self !== 'undefined' ? self : this);
