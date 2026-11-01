/* The board on screen: tiles, character pieces, highlights and animations.
   It draws whatever state it is given; the match controller decides what happens. */
(function (root) {
  'use strict';
  const R = root.StressRules, Art = root.StressArt;
  const SIZE = R.SIZE, CELLS = R.CELLS;
  const SIDE_NAME = ['Blue', 'Red'];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function zoneClass(sq) {
    const half = R.halfOf(sq);
    return half === R.RED ? ' z-red' : half === R.BLUE ? ' z-blue' : ' z-mid';
  }

  /** How a piece feels right now. opts: { threats: show fear of capture, ended: winner or -1, selected } */
  function moodFor(st, sq, opts) {
    const p = st.owner[sq], t = st.type[sq];
    if (opts.ended !== undefined && opts.ended >= 0) return opts.ended === p ? 'happy' : opts.ended === R.DRAW ? 'calm' : 'sad';
    const attacked = R.isAttackedBy(st, sq, 1 - p);
    if (t === R.CROWN && attacked) return 'panic';
    const nerve = R.nerveLeft(st, sq);
    if (nerve === 1) return 'nervous';
    if (opts.threats && attacked) return 'nervous';
    if (opts.selected === sq || nerve > 1 || (t === R.CROWN && R.inEnemyHalf(sq, p))) return 'focus';
    return 'calm';
  }

  function BoardView(el, opts) {
    this.el = el;
    this.opts = opts || {};
    this.ids = new Int32Array(CELLS).fill(-1);
    this.els = new Map();
    this.nextId = 1;
    el.classList.add('board');
    el.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'cells';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Game board');
    this.cells = [];
    for (let sq = 0; sq < CELLS; sq++) {
      const r = R.rowOf(sq), c = R.colOf(sq);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell' + ((r + c) % 2 ? ' dark' : '') + zoneClass(sq);
      cell.dataset.sq = sq;
      cell.addEventListener('click', () => { if (this.opts.onCell) this.opts.onCell(sq); });
      grid.appendChild(cell);
      this.cells.push(cell);
    }
    this.layer = document.createElement('div');
    this.layer.className = 'pieces';
    this.fx = document.createElement('div');
    this.fx.className = 'fx';
    el.append(grid, this.layer, this.fx);
  }

  BoardView.prototype.place = function (p, sq) {
    p.style.setProperty('--r', R.rowOf(sq));
    p.style.setProperty('--c', R.colOf(sq));
  };

  BoardView.prototype.create = function (sq, type, owner) {
    const id = this.nextId++;
    const p = document.createElement('div');
    p.className = 'piece ' + (owner ? 'red' : 'blue');
    p.dataset.type = type;
    p.dataset.owner = owner;
    p.dataset.mood = 'calm';
    p.innerHTML = Art.piece(type, owner, 'calm') + '<span class="pips" aria-hidden="true"><i></i><i></i><i></i></span>';
    // Everyone blinks on their own schedule.
    p.style.setProperty('--blink', (3.6 + Math.random() * 3).toFixed(2) + 's');
    p.style.setProperty('--blink-delay', (-Math.random() * 6).toFixed(2) + 's');
    this.place(p, sq);
    this.layer.appendChild(p);
    this.els.set(id, p);
    this.ids[sq] = id;
    return p;
  };

  BoardView.prototype.setMood = function (p, mood) {
    if (!p || p.dataset.mood === mood) return;
    const old = p.querySelector('.face');
    if (!old) return;
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tmp.innerHTML = Art.face(+p.dataset.owner, mood, +p.dataset.type);
    old.replaceWith(tmp.firstChild);
    p.classList.remove('mood-' + p.dataset.mood);
    p.dataset.mood = mood;
    p.classList.add('mood-' + mood);
  };

  BoardView.prototype.reset = function (st, opts) {
    this.layer.innerHTML = '';
    this.fx.innerHTML = '';
    this.els.clear();
    this.ids.fill(-1);
    this.sync(st, {}, opts || {});
  };

  /**
   * Bring the screen in line with `st`. marks: selected, moves (Map sq -> {capture, risk, danger}),
   * preview (Set), last ([from, to]), hint ([from, to]), spot (Set of squares to spotlight),
   * dim (bool: dim everything not spotlit), interactive. opts: threats, ended.
   */
  BoardView.prototype.sync = function (st, marks, opts) {
    marks = marks || {};
    opts = Object.assign({ selected: marks.selected }, opts || {});
    for (let sq = 0; sq < CELLS; sq++) {
      const owner = st.owner[sq], id = this.ids[sq];
      let p = id >= 0 ? this.els.get(id) : null;
      if (owner < 0) {
        if (p) { p.remove(); this.els.delete(id); }
        this.ids[sq] = -1;
        continue;
      }
      if (!p || +p.dataset.type !== st.type[sq] || +p.dataset.owner !== owner) {
        if (p) { p.remove(); this.els.delete(id); }
        p = this.create(sq, st.type[sq], owner);
      }
      this.place(p, sq);
      p.dataset.nerve = R.nerveLeft(st, sq);
      p.classList.toggle('selected', marks.selected === sq);
      p.classList.toggle('hint', !!(marks.hint && marks.hint[0] === sq));
      this.setMood(p, moodFor(st, sq, opts));
    }
    const last = marks.last || [];
    for (let sq = 0; sq < CELLS; sq++) {
      const cell = this.cells[sq], mv = marks.moves && marks.moves.get(sq);
      cell.classList.toggle('sel', marks.selected === sq);
      cell.classList.toggle('mv', !!mv && !mv.capture);
      cell.classList.toggle('cap', !!mv && mv.capture);
      cell.classList.toggle('risk', !!mv && mv.risk && !mv.danger);
      cell.classList.toggle('danger', !!mv && !!mv.danger);
      cell.classList.toggle('pv', !!(marks.preview && marks.preview.has(sq)));
      cell.classList.toggle('last', last[0] === sq || last[1] === sq);
      cell.classList.toggle('hint-to', !!(marks.hint && marks.hint[1] === sq));
      cell.classList.toggle('hint-from', !!(marks.hint && marks.hint[0] === sq));
      cell.classList.toggle('spot', !!(marks.spot && marks.spot.has(sq)));
      cell.classList.toggle('dim', !!(marks.dim && marks.spot && !marks.spot.has(sq)));
      cell.setAttribute('aria-label', this.describe(st, sq, mv));
    }
    this.el.classList.toggle('interactive', !!marks.interactive);
  };

  BoardView.prototype.describe = function (st, sq, mv) {
    let text = R.squareName(sq);
    const owner = st.owner[sq];
    if (owner >= 0) {
      text += ', ' + SIDE_NAME[owner] + ' ' + R.PIECE_NAMES[st.type[sq]];
      const nerve = R.nerveLeft(st, sq);
      if (nerve >= 0) text += ', raiding, ' + nerve + ' nerve left';
      if (st.type[sq] === R.CROWN && R.isAttackedBy(st, sq, 1 - owner)) text += ', under attack';
    }
    if (mv) {
      text += mv.capture ? ', capture here' : ', move here';
      if (mv.danger) text += ' (dangerous)';
      else if (mv.risk) text += ' (can be captured there)';
    }
    return text;
  };

  BoardView.prototype.pieceAt = function (sq) { return this.els.get(this.ids[sq]) || null; };

  // Show a mood on one piece for a moment (a wince, a grin), then let sync take over again.
  BoardView.prototype.react = function (sq, mood) {
    const p = this.pieceAt(sq);
    if (p) this.setMood(p, mood);
  };

  BoardView.prototype.shake = function () {
    if (reducedMotion()) return;
    this.el.classList.remove('shake');
    void this.el.offsetWidth;
    this.el.classList.add('shake');
  };

  /**
   * Animate the events of one move. hooks: sound(name), haptic(kind), sparkTarget(player),
   * onStress(event), onSuddenDeath(), onCapture(event), onCrack(event).
   */
  BoardView.prototype.animate = async function (events, hooks) {
    const fast = reducedMotion();
    const T = ms => (fast ? 0 : ms);
    const move = events.find(e => e.type === 'move');
    const capture = events.find(e => e.type === 'capture');
    if (move) {
      const id = this.ids[move.from], p = this.els.get(id);
      if (capture) {
        const vid = this.ids[move.to], victim = this.els.get(vid);
        if (victim) {
          this.els.delete(vid);
          this.setMood(victim, 'panic');
          setTimeout(() => victim.classList.add('captured'), T(170));
          setTimeout(() => victim.remove(), T(520));
        }
      }
      this.ids[move.to] = id;
      this.ids[move.from] = -1;
      if (p) {
        p.classList.add('moving');
        p.classList.remove('selected', 'hint');
        this.hop(p, move.from, move.to, fast);
      }
      hooks.sound(capture ? 'capture' : 'move');
      await wait(T(capture ? 230 : 300));
      if (capture) {
        hooks.haptic('impact');
        this.burst(move.to, capture.victim === R.BLUE ? 'blue' : 'red', 10, fast);
        if (hooks.onCapture) hooks.onCapture(capture);
        await wait(T(90));
      } else hooks.haptic('tap');
      if (p) p.classList.remove('moving');
    }
    const win = events.find(e => e.type === 'win');
    if (win && win.reason === 'crown') {
      if (move) { this.burst(move.to, 'gold', 22, fast); this.shake(); }
      hooks.haptic('heavy');
      return;
    }
    const raids = events.filter(e => e.type === 'raid');
    if (raids.length) {
      await wait(T(140));
      hooks.sound('hit');
      hooks.haptic('tap');
      await Promise.all(raids.map((e, i) => this.spark(e, hooks.sparkTarget(1 - e.player), T(120 * i), fast)));
    }
    const stress = events.find(e => e.type === 'stress');
    if (stress) hooks.onStress(stress, raids.length);
    const cracks = events.filter(e => e.type === 'crack');
    if (cracks.length) {
      await wait(T(160));
      hooks.sound('crack');
      hooks.haptic('heavy');
      cracks.forEach(e => this.crack(e, fast));
      if (hooks.onCrack) cracks.forEach(hooks.onCrack);
      this.shake();
      await wait(T(440));
    }
    if (events.some(e => e.type === 'sudden-death')) hooks.onSuddenDeath();
  };

  // A little hop with a squash on landing.
  BoardView.prototype.hop = function (p, from, to, fast) {
    this.place(p, to);
    if (fast || !p.animate) return;
    const r0 = R.rowOf(from), c0 = R.colOf(from), r1 = R.rowOf(to), c1 = R.colOf(to);
    const at = (r, c, extra) => `translate(${c * 112.39}%, ${r * 112.39}%) ${extra || ''}`;
    const dist = Math.hypot(r1 - r0, c1 - c0);
    p.animate([
      { transform: at(r0, c0, 'scale(1)') },
      { transform: at((r0 + r1) / 2 - 0.32 - 0.05 * dist, (c0 + c1) / 2, 'scale(1.06, 1.04)'), offset: 0.5 },
      { transform: at(r1, c1, 'scale(1.12, .86)'), offset: 0.86 },
      { transform: at(r1, c1, 'scale(1)') }
    ], { duration: 300, easing: 'cubic-bezier(.3, .6, .4, 1)' });
  };

  BoardView.prototype.spark = async function (e, target, delay, fast) {
    const p = this.pieceAt(e.at);
    if (p) { p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); }
    this.floater(e.at, '+1', fast);
    if (fast || !target || !document.body.animate) return;
    await wait(delay);
    const from = this.cells[e.at].getBoundingClientRect(), to = target.getBoundingClientRect();
    const s = document.createElement('div');
    s.className = 'spark';
    document.body.appendChild(s);
    const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
    const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
    const mx = (x0 + x1) / 2 + (x1 > x0 ? -1 : 1) * 46, my = (y0 + y1) / 2;
    const anim = s.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.5)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.25)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) scale(.6)`, opacity: 0.9 }
    ], { duration: 540, easing: 'cubic-bezier(.4, 0, .3, 1)' });
    try { await anim.finished; } catch (err) { /* cancelled */ }
    s.remove();
  };

  BoardView.prototype.floater = function (sq, text, fast) {
    if (fast || !document.body.animate) return;
    const f = document.createElement('div');
    f.className = 'floater';
    f.textContent = text;
    f.style.left = (R.colOf(sq) + 0.5) / SIZE * 100 + '%';
    f.style.top = (R.rowOf(sq) + 0.2) / SIZE * 100 + '%';
    this.fx.appendChild(f);
    f.animate([{ transform: 'translate(-50%, -30%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, -90%) scale(1.1)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%, -170%) scale(1)', opacity: 0 }],
      { duration: 900, easing: 'ease-out' }).onfinish = () => f.remove();
  };

  BoardView.prototype.crack = function (e, fast) {
    const id = this.ids[e.at], p = this.els.get(id);
    this.ids[e.at] = -1;
    if (!p) return;
    this.els.delete(id);
    this.setMood(p, 'cracked');
    p.classList.add('cracking');
    this.burst(e.at, e.player === R.BLUE ? 'blue' : 'red', 14, fast);
    setTimeout(() => p.remove(), fast ? 0 : 420);
  };

  BoardView.prototype.burst = function (sq, tone, count, fast) {
    if (fast || !document.body.animate) return;
    const cx = (R.colOf(sq) + 0.5) / SIZE * 100, cy = (R.rowOf(sq) + 0.5) / SIZE * 100;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i');
      bit.className = 'shard ' + tone;
      bit.style.left = cx + '%';
      bit.style.top = cy + '%';
      this.fx.appendChild(bit);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5, d = 20 + Math.random() * 30;
      bit.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.3) rotate(${Math.random() * 220}deg)`, opacity: 0 }
      ], { duration: 520 + Math.random() * 220, easing: 'cubic-bezier(.2, .7, .3, 1)' }).onfinish = () => bit.remove();
    }
  };

  /** Small non-interactive diagram for the rules and the tutorial cards. */
  BoardView.diagram = function (el, rows, marks, nerve, label) {
    const n = rows.length, code = { C: 1, G: 2, R: 3, J: 4 };
    marks = marks || {};
    nerve = nerve || {};
    let html = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const name = 'abcdefg'[c] + (n - r), ch = rows[r][c];
      let cls = 'cell' + ((r + c) % 2 ? ' dark' : '');
      if (n === SIZE) cls += zoneClass(r * SIZE + c);
      if (marks[name]) cls += ' ' + marks[name];
      let inner = '';
      if (ch !== '.') {
        const owner = ch === ch.toUpperCase() ? 0 : 1, type = code[ch.toUpperCase()];
        const nv = nerve[name] === undefined ? '' : ' data-nerve="' + nerve[name] + '"';
        const mood = nerve[name] === 1 ? 'nervous' : nerve[name] !== undefined ? 'focus' : 'calm';
        inner = '<span class="piece ' + (owner ? 'red' : 'blue') + '"' + nv + '>' + Art.piece(type, owner, mood) + '<span class="pips" aria-hidden="true"><i></i><i></i><i></i></span></span>';
      }
      html += '<div class="' + cls + '">' + inner + '</div>';
    }
    el.classList.add('board', 'diagram');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label || 'Board diagram');
    el.innerHTML = '<div class="cells" style="grid-template-columns:repeat(' + n + ',1fr);grid-template-rows:repeat(' + n + ',1fr)">' + html + '</div>';
  };

  BoardView.moodFor = moodFor;
  root.StressBoardView = BoardView;
})(typeof self !== 'undefined' ? self : this);
