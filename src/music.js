/* A calm, generative ambient soundtrack made with Web Audio: soft chords that
   drift every few bars and an occasional plucked note, through a gentle echo.
   Nothing is downloaded. Starts only after the player has touched the page. */
(function (root) {
  'use strict';
  let ctx = null, out = null, echo = null, running = false, timer = null, step = 0, wanted = false;
  // Chords as MIDI notes (Cmaj9, Am9, Fmaj9, G6/9), voiced low and wide.
  const CHORDS = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 64], [41, 48, 55, 57, 64], [43, 50, 57, 59, 64]];
  const PLUCKS = [72, 74, 76, 79, 81, 84, 86, 88];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function setup() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    out.connect(lp).connect(ctx.destination);
    echo = ctx.createDelay(1.5);
    echo.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    echo.connect(fb).connect(echo);
    echo.connect(wet).connect(out);
    return true;
  }

  function pad(notes, at, dur) {
    notes.forEach((m, i) => {
      [-4, 4].forEach(detune => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = hz(m);
        o.detune.value = detune;
        const v = (i === 0 ? 0.05 : 0.022);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(v, at + 2.2);
        g.gain.setValueAtTime(v, at + dur - 2.6);
        g.gain.linearRampToValueAtTime(0.0001, at + dur);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + dur + 0.1);
      });
    });
  }

  function pluck(m, at) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = hz(m);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.045, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    o.connect(g);
    g.connect(out);
    g.connect(echo);
    o.start(at);
    o.stop(at + 1.7);
  }

  // Schedule one bar (8 seconds) ahead of time.
  function bar() {
    if (!running) return;
    const at = ctx.currentTime + 0.1, chord = CHORDS[step % CHORDS.length];
    pad(chord, at, 9);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) pluck(PLUCKS[Math.floor(Math.random() * PLUCKS.length)], at + 1 + Math.random() * 6);
    step++;
    timer = setTimeout(bar, 8000);
  }

  function start() {
    wanted = true;
    if (running) return;
    if (!ctx && !setup()) return;
    if (ctx.state === 'suspended') ctx.resume();
    running = true;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3);
    bar();
  }

  function stop() {
    wanted = false;
    if (!running) return;
    running = false;
    clearTimeout(timer);
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
  }

  // Pause when the app is in the background, resume when it comes back.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) { if (running) { const w = wanted; stop(); wanted = w; } }
      else if (wanted) start();
    });
  }

  root.StressMusic = { start, stop, get playing() { return running; } };
})(typeof self !== 'undefined' ? self : this);
