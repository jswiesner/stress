/* Interface icons (24x24, stroke-based) and the star used for ratings. */
(function (root) {
  'use strict';
  const s = (d, extra) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"${extra || ''}>${d}</svg>`;
  const ICONS = {
    back: s('<path d="M15 5 8 12l7 7"/>'),
    close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
    gear: s('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2M5.5 12H3M21 12h-2.5"/><circle cx="12" cy="12" r="6.6"/>'),
    help: s('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4"/><path d="M12 17h.01" stroke-width="3"/>'),
    more: s('<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.4"/>'),
    sound: s('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    mute: s('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="m16 9.5 5 5m0-5-5 5"/>'),
    undo: s('<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>'),
    hint: s('<path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z"/><path d="M9.5 19.5h5"/>'),
    reset: s('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'),
    share: s('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
    lock: s('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    check: s('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="3"'),
    puzzle: s('<path d="M9 4h3a2 2 0 1 1 4 0h0v4a2 2 0 1 0 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 1 0-4V4z"/>'),
    swords: s('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 14.5 6 18l-2 2M3.5 20.5l1 1M14 9.5 18 6V3h3v3l-3.5 4"/>'),
    people: s('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.8 0 5 2 5 5"/>'),
    trophy: s('<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 21h8M9.5 17h5"/>'),
    palette: s('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.6-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1.3" fill="currentColor"/><circle cx="11" cy="7.2" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.3" r="1.3" fill="currentColor"/>'),
    medal: s('<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.8 6 3h4l2 4.5L14 3h4l-2.5 7.8"/><path d="m12 12.6.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" stroke-width="1"/>'),
    ladder: s('<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>'),
    calendar: s('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
    music: s('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2c1 3.6 5.8 6 5.8 11.2A5.8 5.8 0 0 1 12 19a5.8 5.8 0 0 1-5.8-5.8c0-2.5 1.3-4.1 2.6-5.4.3 1.8 1.2 3 2.4 3.2C10.6 8.4 11 5 12 2z" fill="#FF7A3D"/><path d="M12 10.5c.6 1.9 3 3 3 5.6a3 3 0 0 1-6 0c0-1.6 1-2.6 1.9-3.3.1 1 .6 1.6 1.2 1.7-.3-1.6-.4-2.7-.1-4z" fill="#FFD166"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2.6 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="url(#star-gold)" stroke="#C88A03" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    starEmpty: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2.6 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="var(--track)" stroke="var(--line-2)" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  };
  const STAR_DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="star-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#F2A50C"/></linearGradient></defs></svg>';
  const stars = (n, of) => '<span class="stars" aria-label="' + n + ' of ' + (of || 3) + ' stars">' + Array.from({ length: of || 3 }, (_, i) => (i < n ? ICONS.star : ICONS.starEmpty)).join('') + '</span>';
  root.StressIcons = Object.assign(ICONS, { STAR_DEFS, stars });
})(typeof self !== 'undefined' ? self : this);
