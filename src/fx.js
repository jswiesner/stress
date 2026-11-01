/* Celebration effects: confetti and counting numbers. Respect reduced motion. */
(function (root) {
  'use strict';
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const COLORS = ['#F2B624', '#3D86F0', '#F2604F', '#14A886', '#FF9DB8', '#9D82F5'];

  function confetti(amount) {
    if (reduced() || !document.body.animate) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    document.body.appendChild(layer);
    const n = amount || 80, w = window.innerWidth, h = window.innerHeight;
    let left = n;
    for (let i = 0; i < n; i++) {
      const bit = document.createElement('i');
      bit.style.left = Math.random() * 100 + '%';
      bit.style.background = COLORS[i % COLORS.length];
      if (i % 3 === 0) bit.style.borderRadius = '50%';
      layer.appendChild(bit);
      const drift = (Math.random() - 0.5) * w * 0.35, spin = (Math.random() - 0.5) * 900;
      bit.animate([
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${drift}px, ${h * (0.75 + Math.random() * 0.35)}px) rotate(${spin}deg)`, opacity: 0.9, offset: 0.85 },
        { transform: `translate(${drift * 1.1}px, ${h + 40}px) rotate(${spin * 1.2}deg)`, opacity: 0 }
      ], { duration: 1800 + Math.random() * 1400, delay: Math.random() * 400, easing: 'cubic-bezier(.25, .6, .45, 1)' }).onfinish = () => {
        bit.remove();
        if (--left === 0) layer.remove();
      };
    }
  }

  // Count a number up inside an element.
  function countUp(el, from, to, ms, fmt) {
    fmt = fmt || (v => String(v));
    if (reduced() || to === from) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  root.StressFx = { confetti, countUp, reduced };
})(typeof self !== 'undefined' ? self : this);
