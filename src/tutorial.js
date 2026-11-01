/* The first-run tutorial: five tiny lessons on real rules, about a minute in all.
   Each lesson sets up a position; the player may only make the move being taught,
   Red's replies are scripted, and the engine does the rest (hits, cracks, wins). */
(function (root) {
  'use strict';
  const R = root.StressRules, Art = root.StressArt, BoardView = root.StressBoardView;
  const Sound = root.StressSound, Haptics = root.StressHaptics, Fx = root.StressFx;
  const $ = id => document.getElementById(id);
  const sq = name => R.squareIndex(name);

  const LESSONS = [
    {
      id: 'raid',
      rows: ['...c...', '......g', '.......', '..J....', '.......', '.......', '...C...'],
      stress: [0, 0],
      steps: [
        { say: 'Welcome to Stress! This is your Jumper. Tap it.', select: 'c4' },
        { say: 'Jumpers hop in an L. Hop into the red half: tap the glowing square.', move: ['c4', ['e5']], reply: 'g6-f6' },
        { say: 'Your raider survived Red’s turn, so Red takes 1 Stress. It hits again every turn it survives.', next: 'Next' }
      ]
    },
    {
      id: 'nerve',
      rows: ['...c...', '.....g.', '....J..', '.......', '.......', '.......', '...C...'],
      stress: [0, 2], hits: { e5: 2 },
      steps: [
        { say: 'Raiders have 3 hits of nerve. This one is down to its last (red dot) and it’s sweating. One more hit and it cracks!', next: 'Uh oh' },
        { say: 'Hop it back to the middle row or your own half to refill its nerve.', move: ['e5', ['c4', 'g4', 'd3', 'f3']], reply: 'f6-f7' },
        { say: 'Phew, nerve refilled. Raid, pull back, raid again: that’s the rhythm of Stress.', next: 'Next' }
      ]
    },
    {
      id: 'capture',
      rows: ['...c...', '.......', '...r...', '.......', '...G...', '.......', '...C...'],
      stress: [0, 0],
      steps: [
        { say: 'Guards move 1 or 2 squares straight. A red Runner wandered close: land on it to capture it.', move: ['d3', ['d5']], reply: 'd7-c7' },
        { say: 'Captured! Your Guard is in their half, so it’s raiding too: +1 Stress.', next: 'Next' }
      ]
    },
    {
      id: 'crack',
      rows: ['..c...g', '.......', '.......', '.......', '....R..', '.......', '...C...'],
      stress: [0, 9],
      steps: [
        { say: 'Red is at 9 Stress. One more hit cracks them! Runners move diagonally. Tap yours.', select: 'e3' },
        { say: 'Amber means a piece could catch you there: the red Guard covers g5. Raid on the safe square.', move: ['e3', ['c5']], reply: 'c7-c6' },
        { say: 'Red cracked under pressure! That’s one way to win.', next: 'Next', celebrate: true }
      ]
    },
    {
      id: 'crown',
      rows: ['...c...', '.......', '....J..', '.......', '.......', '.......', '...C...'],
      stress: [0, 0],
      steps: [
        { say: 'The other way to win: capture their Crown. Your Jumper can reach it. Go!', move: ['e5', ['d7']] },
        { say: 'Crown captured! Crack them or catch their Crown, and keep yours safe. You’re ready.', next: 'Let’s play', celebrate: true, last: true }
      ]
    }
  ];

  let view = null, app = null, state = null, lesson = 0, step = 0, busy = false, selected = -1;

  function stepNow() { return LESSONS[lesson].steps[step]; }

  function load(i) {
    lesson = i;
    step = 0;
    const L = LESSONS[i];
    state = R.fromRows(L.rows, { stress: L.stress, hits: L.hits || {} });
    selected = -1;
    view.reset(state, { threats: true });
    $('t-count').textContent = 'Lesson ' + (i + 1) + ' of ' + LESSONS.length;
    run();
  }

  function marks() {
    const s = stepNow(), m = { selected, moves: new Map(), spot: new Set(), dim: false, interactive: !busy && !s.next };
    if (s.select) m.spot.add(sq(s.select));
    if (s.move) {
      const from = sq(s.move[0]);
      if (selected !== from) m.spot.add(from);
      else {
        // Show every legal move with hints, but only the taught ones glow.
        for (const to of R.pieceTargets(state, from)) {
          const w = R.clone(state);
          R.play(w, R.makeMove(from, to));
          m.moves.set(to, { capture: state.owner[to] !== -1, risk: w.winner === -1 && w.owner[to] === R.BLUE && R.isAttackedBy(w, to, R.RED) });
        }
        s.move[1].forEach(t => m.spot.add(sq(t)));
      }
    }
    return m;
  }

  function render() {
    view.sync(state, marks(), { threats: true, ended: state.winner });
    for (const p of [0, 1]) {
      const el = $('t-meter-' + p);
      if (el.children.length !== 10) {
        el.innerHTML = '';
        for (let i = 1; i <= 10; i++) { const s = document.createElement('i'); s.className = 'l' + (i <= 3 ? 1 : i <= 6 ? 2 : i <= 9 ? 3 : 4); el.appendChild(s); }
      }
      for (let i = 0; i < 10; i++) el.children[i].classList.toggle('on', i < state.stress[p]);
      $('t-stress-' + p).textContent = Math.min(10, state.stress[p]);
    }
    $('t-opp-face').innerHTML = Art.piece(R.CROWN, R.RED, state.winner === R.BLUE ? 'sad' : state.stress[R.RED] >= 7 ? 'nervous' : 'calm');
    $('t-me-face').innerHTML = Art.piece(R.CROWN, R.BLUE, state.winner === R.BLUE ? 'happy' : 'calm');
  }

  function run() {
    const s = stepNow();
    $('t-text').textContent = s.say;
    const next = $('t-next');
    next.hidden = !s.next;
    if (s.next) next.textContent = s.next;
    if (s.celebrate) { Fx.confetti(70); Sound.play('win'); Haptics.play('success'); }
    render();
  }

  function advance() {
    const L = LESSONS[lesson];
    if (step + 1 < L.steps.length) { step++; run(); return; }
    if (lesson + 1 < LESSONS.length) { Sound.play('whoosh'); load(lesson + 1); return; }
    app.finishTutorial();
  }

  async function playScripted(m) {
    const res = R.apply(state, m);
    await view.animate(res.events, {
      sound: n => Sound.play(n), haptic: k => Haptics.play(k),
      sparkTarget: p => $('t-meter-' + p),
      onStress: () => {}, onSuddenDeath: () => {}
    });
    state = res.state;
    render();
  }

  async function onCell(i) {
    app.unlockAudio();
    if (busy) return;
    const s = stepNow();
    if (s.select) {
      if (i === sq(s.select)) { selected = i; Sound.play('select'); Haptics.play('select'); advance(); }
      else nudge();
      return;
    }
    if (!s.move) return;
    const from = sq(s.move[0]);
    if (selected !== from) {
      if (i === from) { selected = i; Sound.play('select'); render(); } else nudge();
      return;
    }
    if (!s.move[1].map(sq).includes(i)) { if (i !== from) nudge(); return; }
    busy = true;
    selected = -1;
    render();
    await playScripted(R.makeMove(from, i));
    if (s.reply && state.winner === -1) {
      await new Promise(r => setTimeout(r, 450));
      const [a, b] = s.reply.split('-');
      await playScripted(R.makeMove(sq(a), sq(b)));
    }
    busy = false;
    advance();
  }

  function nudge() {
    Sound.play('wrong');
    const coach = $('t-coach');
    coach.classList.remove('nudge');
    void coach.offsetWidth;
    coach.classList.add('nudge');
  }

  function start(appRef) {
    app = appRef;
    if (!view) {
      view = new BoardView($('t-board'), { onCell });
      $('t-next').addEventListener('click', () => { Sound.play('pop'); advance(); });
      $('t-skip').addEventListener('click', () => app.finishTutorial(true));
    }
    busy = false;
    load(0);
  }

  root.StressTutorial = { start, LESSONS };
})(typeof self !== 'undefined' ? self : this);
