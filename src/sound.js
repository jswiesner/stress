/* Soft synthesized sounds (Web Audio). Nothing loads from the network,
   and nothing plays until the player has touched the page. */
(function (root) {
  'use strict';
  let ctx = null, out = null, enabled = true;

  function audio() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.55;
      out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, at, dur, type, vol, slideTo) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hiss(at, dur, vol, freq) {
    const t = ctx.currentTime + at, len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    g.gain.value = vol;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  const SOUNDS = {
    select: () => tone(740, 0, 0.05, 'sine', 0.035),
    move: () => tone(300, 0, 0.11, 'sine', 0.07, 410),
    capture: () => { tone(240, 0, 0.16, 'triangle', 0.09, 140); hiss(0, 0.09, 0.05, 1600); },
    hit: () => tone(587, 0, 0.16, 'sine', 0.05, 880),
    crack: () => { hiss(0, 0.26, 0.11, 2400); tone(170, 0, 0.2, 'triangle', 0.05, 90); },
    alert: () => { tone(660, 0, 0.09, 'triangle', 0.04); tone(660, 0.13, 0.09, 'triangle', 0.04); },
    tick: () => tone(1000, 0, 0.03, 'sine', 0.025),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.32, 'sine', 0.06)),
    lose: () => [440, 370, 294].forEach((f, i) => tone(f, i * 0.15, 0.34, 'sine', 0.05)),
    shatter: () => { hiss(0, 0.5, 0.12, 1200); hiss(0.05, 0.35, 0.08, 3600); tone(120, 0, 0.45, 'triangle', 0.06, 60); },
    star: () => { tone(880, 0, 0.18, 'sine', 0.06, 1320); tone(1320, 0.05, 0.22, 'triangle', 0.03); },
    levelup: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.05)),
    unlock: () => { tone(660, 0, 0.12, 'sine', 0.05); tone(990, 0.1, 0.3, 'sine', 0.05); },
    tick2: () => tone(1400, 0, 0.02, 'sine', 0.02),
    pop: () => tone(520, 0, 0.07, 'sine', 0.05, 760),
    whoosh: () => hiss(0, 0.25, 0.05, 900),
    wrong: () => { tone(330, 0, 0.14, 'triangle', 0.05, 250); }
  };

  root.StressSound = {
    play(name) {
      if (!enabled || !SOUNDS[name]) return;
      try { if (audio()) SOUNDS[name](); } catch (e) { /* audio is optional */ }
    },
    setEnabled(on) { enabled = !!on; },
    unlock() { if (enabled) { try { audio(); } catch (e) { /* ignore */ } } }
  };
})(typeof self !== 'undefined' ? self : this);
