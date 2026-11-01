/* The board on screen: cells, pieces, highlights and animations.
   It draws whatever state it is given; app.js decides what happens. */
(function (root) {
  'use strict';
  const R = root.StressRules;
  const SIZE = R.SIZE, CELLS = R.CELLS;
  const ICONS = {
    1: '<path d="M4.6 17.6 5.9 8.4l3.9 3.7L12 5.6l2.2 6.5 3.9-3.7 1.3 9.2z" fill="currentColor"/><rect x="4.6" y="18.4" width="14.8" height="1.9" rx=".9" fill="currentColor"/>',
    2: '<path d="M12 4.8v14.4M4.8 12h14.4" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round"/>',
    3: '<path d="M6.6 6.6l10.8 10.8M17.4 6.6 6.6 17.4" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round"/>',
    4: '<path d="M8.6 4.8v13.6h7.6" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const TYPE_CLASS = ['', 'crown', 'guard', 'runner', 'jumper'];
  const SIDE_CLASS = ['blue', 'red'];
  const SIDE_NAME = ['Blue', 'Red'];

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function glyph(type) {
    return '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[type] + '</svg>';
  }

  function zoneClass(sq) {
    const half = R.halfOf(sq);
    return half === R.RED ? ' z-red' : half === R.BLUE ? ' z-blue' : ' z-mid';
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
      let coords = '';
      if (c === 0) coords += '<span class="coord rank" aria-hidden="true">' + (SIZE - r) + '</span>';
      if (r === SIZE - 1) coords += '<span class="coord file" aria-hidden="true">' + 'abcdefg'[c] + '</span>';
      cell.innerHTML = coords;
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

  BoardView.prototype.place = function (pieceEl, sq) {
    pieceEl.style.setProperty('--r', R.rowOf(sq));
    pieceEl.style.setProperty('--c', R.colOf(sq));
  };

  BoardView.prototype.create = function (sq, type, owner) {
    const id = this.nextId++;
    const p = document.createElement('div');
    p.className = 'piece ' + SIDE_CLASS[owner] + ' ' + TYPE_CLASS[type];
    p.dataset.type = type;
    p.dataset.owner = owner;
    p.innerHTML = glyph(type) + '<span class="pips" aria-hidden="true"><i></i><i></i><i></i></span>';
    this.place(p, sq);
    this.layer.appendChild(p);
    this.els.set(id, p);
    this.ids[sq] = id;
    return p;
  };

  // Forget all piece elements and draw `st` from scratch (new game, undo, resume).
  BoardView.prototype.reset = function (st) {
    this.layer.innerHTML = '';
    this.fx.innerHTML = '';
    this.els.clear();
    this.ids.fill(-1);
    this.sync(st, {});
  };

  /**
   * Bring the screen in line with `st`. `marks` describes highlights:
   * selected, moves (Map square -> {capture, risk, danger}), preview (Set), last ([from, to]),
   * alert (square of a threatened Crown), interactive (bool).
   */
  BoardView.prototype.sync = function (st, marks) {
    marks = marks || {};
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
      const nerve = R.nerveLeft(st, sq);
      p.dataset.nerve = nerve;
      p.classList.toggle('raiding', R.inEnemyHalf(sq, owner));
      p.classList.toggle('selected', marks.selected === sq);
      p.classList.toggle('threatened', marks.alert === sq);
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
      cell.classList.toggle('pv-from', marks.previewFrom === sq);
      cell.classList.toggle('last', last[0] === sq || last[1] === sq);
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
    }
    if (mv) {
      text += mv.capture ? ', capture here' : ', move here';
      if (mv.danger) text += ' (dangerous)';
      else if (mv.risk) text += ' (can be captured there)';
    }
    return text;
  };

  /**
   * Animate the events of one move. hooks: sound(name), haptic(pattern),
   * sparkTarget(player) -> element the raid sparks fly to, onStress(event), onSuddenDeath().
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
          setTimeout(() => victim.classList.add('captured'), T(140));
          setTimeout(() => victim.remove(), T(460));
        }
      }
      this.ids[move.to] = id;
      this.ids[move.from] = -1;
      if (p) {
        p.classList.add('moving');
        p.classList.remove('selected');
        this.place(p, move.to);
      }
      hooks.sound(capture ? 'capture' : 'move');
      hooks.haptic(capture ? [14, 30, 14] : 8);
      await wait(T(260));
      if (p) p.classList.remove('moving');
    }
    const win = events.find(e => e.type === 'win');
    if (win && win.reason === 'crown') {
      if (move) this.burst(move.to, 'gold', 18, fast);
      return;
    }
    const raids = events.filter(e => e.type === 'raid');
    if (raids.length) {
      await wait(T(120));
      hooks.sound('hit');
      await Promise.all(raids.map((e, i) => this.spark(e, hooks.sparkTarget(1 - e.player), T(110 * i), fast)));
    }
    const stress = events.find(e => e.type === 'stress');
    if (stress) hooks.onStress(stress);
    const cracks = events.filter(e => e.type === 'crack');
    if (cracks.length) {
      await wait(T(140));
      hooks.sound('crack');
      hooks.haptic([20, 40, 30]);
      cracks.forEach(e => this.crack(e, fast));
      await wait(T(420));
    }
    if (events.some(e => e.type === 'sudden-death')) hooks.onSuddenDeath();
  };

  BoardView.prototype.spark = async function (e, target, delay, fast) {
    const p = this.els.get(this.ids[e.at]);
    if (p) { p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); }
    if (fast || !target || !document.body.animate) return;
    await wait(delay);
    const from = this.cells[e.at].getBoundingClientRect(), to = target.getBoundingClientRect();
    const s = document.createElement('div');
    s.className = 'spark';
    document.body.appendChild(s);
    const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
    const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
    const mx = (x0 + x1) / 2 + (x1 > x0 ? -1 : 1) * 40, my = Math.min(y0, y1) - 30;
    const anim = s.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) scale(.55)`, opacity: 0.9 }
    ], { duration: 560, easing: 'cubic-bezier(.4,0,.3,1)' });
    try { await anim.finished; } catch (err) { /* cancelled */ }
    s.remove();
  };

  BoardView.prototype.crack = function (e, fast) {
    const id = this.ids[e.at], p = this.els.get(id);
    this.ids[e.at] = -1;
    if (!p) return;
    this.els.delete(id);
    p.classList.add('cracking');
    this.burst(e.at, e.player === R.BLUE ? 'blue' : 'red', 12, fast);
    setTimeout(() => p.remove(), fast ? 0 : 380);
  };

  // A small shower of particles from the middle of a square.
  BoardView.prototype.burst = function (sq, tone, count, fast) {
    if (fast || !document.body.animate) return;
    const cx = (R.colOf(sq) + 0.5) / SIZE * 100, cy = (R.rowOf(sq) + 0.5) / SIZE * 100;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i');
      bit.className = 'shard ' + tone;
      bit.style.left = cx + '%';
      bit.style.top = cy + '%';
      this.fx.appendChild(bit);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5, d = 18 + Math.random() * 26;
      bit.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.3) rotate(${Math.random() * 180}deg)`, opacity: 0 }
      ], { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => bit.remove();
    }
  };

  /**
   * A small, non-interactive diagram for the rules screen.
   * rows: 7 (or 5) strings as in StressRules.fromRows; marks: { 'e5': 'dot' | 'cap' }, nerve: { 'e5': 2 }.
   */
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
        inner = '<span class="piece static ' + SIDE_CLASS[owner] + ' ' + TYPE_CLASS[type] + (nerve[name] !== undefined ? ' raiding' : '') + '"' + nv + '>' + glyph(type) + '<span class="pips" aria-hidden="true"><i></i><i></i><i></i></span></span>';
      }
      html += '<div class="' + cls + '">' + inner + '</div>';
    }
    el.classList.add('board', 'diagram');
    el.style.setProperty('--n', n);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label || 'Board diagram');
    el.innerHTML = '<div class="cells">' + html + '</div>';
  };

  root.StressBoardView = BoardView;
})(typeof self !== 'undefined' ? self : this);
