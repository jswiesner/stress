/*
 * Stress character art. Every piece is a little pebble with a face.
 * Shape tells you how it moves: the Guard is a square (straight lines), the
 * Runner a diamond (diagonals), the Jumper has bunny ears (it hops), and the
 * Crown wears one. Faces show how the piece feels: calm at home, focused on a
 * raid, sweating on its last nerve, panicking when its Crown is in danger.
 *
 * Everything is inline SVG built from strings, so it scales crisply at any size
 * and needs no image files. Shared gradients live in one hidden <svg> (Art.defs()).
 */
(function (root) {
  'use strict';
  const CROWN = 1, GUARD = 2, RUNNER = 3, JUMPER = 4;

  const TEAM = [
    { name: 'blue', light: '#7DB8FF', mid: '#3D86F0', dark: '#2560C4', line: '#1A4796', cheek: '#FF9DB8' },
    { name: 'red', light: '#FFA594', mid: '#F2604F', dark: '#C93D35', line: '#952822', cheek: '#FFD0A8' }
  ];

  // Hidden gradient definitions, referenced by every piece on the page.
  function defs() {
    const grads = TEAM.map(t =>
      `<radialGradient id="body-${t.name}" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${t.light}"/><stop offset=".55" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.dark}"/></radialGradient>`
    ).join('');
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + grads +
      '<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#E9A81C"/></linearGradient>' +
      '<linearGradient id="sweat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8F8FF"/><stop offset="1" stop-color="#8FD3F4"/></linearGradient>' +
      '</defs></svg>';
  }

  // Body outline for each piece type, and where its face sits (cx, cy, scale).
  const BODY = {
    [GUARD]: { d: 'M30 20h40a16 16 0 0 1 16 16v34a16 16 0 0 1-16 16H30a16 16 0 0 1-16-16V36a16 16 0 0 1 16-16z', face: [50, 54, 1] },
    [RUNNER]: { d: 'M50 9c3 0 5 1.6 7 3.6l30 30c4 4 4 10 0 14l-30 30c-4 4-10 4-14 0l-30-30c-4-4-4-10 0-14l30-30C45 10.6 47 9 50 9z', face: [50, 52, 0.92] },
    [JUMPER]: { d: 'M50 24c19 0 34 14 34 33s-15 31-34 31-34-12-34-31 15-33 34-33z', face: [50, 58, 1], ears: true },
    [CROWN]: { d: 'M50 26c19 0 34 13 34 31s-15 31-34 31-34-13-34-31 15-31 34-31z', face: [50, 58, 1], crown: true }
  };

  const EARS = (t) =>
    `<g class="ears"><path d="M30 34c-6-12-6-26 0-30 6-3 12 8 13 25" fill="url(#body-${t.name})" stroke="${t.line}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M70 34c6-12 6-26 0-30-6-3-12 8-13 25" fill="url(#body-${t.name})" stroke="${t.line}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M33 30c-3-8-3-17 0-20 3-1 6 6 7 17" fill="${t.cheek}" opacity=".55"/><path d="M67 30c3-8 3-17 0-20-3-1-6 6-7 17" fill="${t.cheek}" opacity=".55"/></g>`;

  const CROWN_CAP =
    '<g class="cap"><path d="M30 30 26 10l13 10 11-14 11 14 13-10-4 20z" fill="url(#gold)" stroke="#A9780C" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<circle cx="50" cy="20" r="3" fill="#FF6F91"/><circle cx="36" cy="23" r="2.2" fill="#7FD8FF"/><circle cx="64" cy="23" r="2.2" fill="#7FD8FF"/></g>';

  // Faces, drawn around (50, 56) and moved/scaled into place per body.
  const EYE_L = 39, EYE_R = 61, EYE_Y = 53;
  const eyes = (rx, ry) =>
    `<g class="eyes"><ellipse cx="${EYE_L}" cy="${EYE_Y}" rx="${rx}" ry="${ry}" fill="#1D2321"/><ellipse cx="${EYE_R}" cy="${EYE_Y}" rx="${rx}" ry="${ry}" fill="#1D2321"/>` +
    `<circle cx="${EYE_L + 1.8}" cy="${EYE_Y - 2.6}" r="1.7" fill="#fff"/><circle cx="${EYE_R + 1.8}" cy="${EYE_Y - 2.6}" r="1.7" fill="#fff"/></g>`;
  const cheeks = c => `<ellipse cx="31" cy="62" rx="5" ry="3.2" fill="${c}" opacity=".55"/><ellipse cx="69" cy="62" rx="5" ry="3.2" fill="${c}" opacity=".55"/>`;
  const mouth = d => `<path d="${d}" fill="none" stroke="#1D2321" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const sweat = '<path class="drop" d="M79 34c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" fill="url(#sweat)" stroke="#5DB3DA" stroke-width="1.5"/>';

  const FACES = {
    calm: t => eyes(5, 6.5) + cheeks(t.cheek) + mouth('M44 64q6 5 12 0'),
    focus: t => eyes(5, 5.6) + `<path d="M33 44l11 3M67 44l-11 3" stroke="#1D2321" stroke-width="3" stroke-linecap="round"/>` + cheeks(t.cheek) + mouth('M43 64.5h14'),
    nervous: t => eyes(5.6, 7.2) + `<path d="M33 43l10-2M67 43l-10-2" stroke="#1D2321" stroke-width="3" stroke-linecap="round"/>` + cheeks(t.cheek) + mouth('M41 66q3-3 6 0t6 0t6 0') + sweat,
    panic: t => `<g class="eyes"><circle cx="${EYE_L}" cy="${EYE_Y}" r="7.5" fill="#fff" stroke="#1D2321" stroke-width="2.5"/><circle cx="${EYE_R}" cy="${EYE_Y}" r="7.5" fill="#fff" stroke="#1D2321" stroke-width="2.5"/><circle cx="${EYE_L}" cy="${EYE_Y + 1}" r="2.8" fill="#1D2321"/><circle cx="${EYE_R}" cy="${EYE_Y + 1}" r="2.8" fill="#1D2321"/></g>` +
      '<ellipse cx="50" cy="69" rx="5" ry="6" fill="#1D2321"/>' + sweat,
    happy: t => mouth('M33 54q6-7 12 0M55 54q6-7 12 0') + cheeks(t.cheek) + '<path d="M41 62q9 11 18 0z" fill="#1D2321" stroke="#1D2321" stroke-width="2.5" stroke-linejoin="round"/><path d="M45 66q5 3 10 0" fill="none" stroke="#FF8FA3" stroke-width="3" stroke-linecap="round"/>',
    sad: t => eyes(4.6, 5.4) + `<path d="M33 46l10-3.5M67 46l-10-3.5" stroke="#1D2321" stroke-width="3" stroke-linecap="round"/>` + mouth('M44 68q6-5 12 0'),
    cracked: t => mouth('M34 48l9 9M43 48l-9 9M57 48l9 9M66 48l-9 9') + mouth('M43 68q7-4 14 0'),
    sleepy: t => mouth('M34 54q5 3 10 0M56 54q5 3 10 0') + cheeks(t.cheek) + mouth('M45 65q5 3 10 0')
  };

  function face(team, mood, type) {
    const [cx, cy, s] = BODY[type].face;
    const t = TEAM[team];
    const f = (FACES[mood] || FACES.calm)(t);
    return `<g class="face mood-${mood}" transform="translate(${cx - 50 * s} ${cy - 56 * s}) scale(${s})">${f}</g>`;
  }

  /** Full piece SVG. mood: calm | focus | nervous | panic | happy | sad | cracked | sleepy */
  function piece(type, team, mood) {
    const b = BODY[type], t = TEAM[team];
    return `<svg class="art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
      (b.ears ? EARS(t) : '') +
      `<path class="body" d="${b.d}" fill="url(#body-${t.name})" stroke="${t.line}" stroke-width="3.2" stroke-linejoin="round"/>` +
      `<path d="M30 33q8-8 20-9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45" transform="${type === RUNNER ? 'translate(4 2)' : ''}"/>` +
      (b.crown ? CROWN_CAP : '') +
      face(team, mood || 'calm', type) +
      `</svg>`;
  }

  // ---- rivals: a Red Crown with an accessory each ----
  const ACCESSORY = {
    sprout: '<path d="M50 26c0-8 2-13 6-16" stroke="#3E9B4F" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M56 10c8-4 14 0 14 6-7 3-12 1-14-6z" fill="#6CCB5F" stroke="#3E9B4F" stroke-width="2"/><path d="M53 15c-7-5-13-2-14 4 6 3 11 2 14-4z" fill="#8FDE7A" stroke="#3E9B4F" stroke-width="2"/>',
    beanie: '<path d="M22 44c0-18 12-27 28-27s28 9 28 27z" fill="#7E5BEF" stroke="#4B33A8" stroke-width="3"/><path d="M20 44h60" stroke="#4B33A8" stroke-width="7" stroke-linecap="round"/><path d="M20 44h60" stroke="#9D82F5" stroke-width="3.5" stroke-linecap="round"/><circle cx="50" cy="15" r="6" fill="#FFD166" stroke="#C99A2E" stroke-width="2"/>',
    glasses: '<g fill="rgba(255,255,255,.35)" stroke="#2B2F2E" stroke-width="3"><circle cx="39" cy="53" r="9"/><circle cx="61" cy="53" r="9"/></g><path d="M48 52h4M30 51l-8-3M70 51l8-3" stroke="#2B2F2E" stroke-width="3" stroke-linecap="round"/>',
    bunny: '<path d="M38 30c-6-12-4-22 1-24 5-1 8 9 7 22M62 30c6-12 4-22-1-24-5-1-8 9-7 22" fill="#fff" stroke="#E7A3B5" stroke-width="3" stroke-linejoin="round"/><path d="M28 34c10-7 34-7 44 0" stroke="#E7A3B5" stroke-width="5" fill="none" stroke-linecap="round"/>',
    mask: '<path d="M24 50c8-8 44-8 52 0-2 8-10 10-15 8-4-2-7-3-11-3s-7 1-11 3c-5 2-13 0-15-8z" fill="#2B2F2E"/><ellipse cx="39" cy="52" rx="5" ry="4" fill="#fff"/><ellipse cx="61" cy="52" rx="5" ry="4" fill="#fff"/><circle cx="39" cy="52" r="2.4" fill="#1D2321"/><circle cx="61" cy="52" r="2.4" fill="#1D2321"/>',
    sweatband: '<path d="M18 42c12-9 52-9 64 0" stroke="#FFFFFF" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M18 42c12-9 52-9 64 0" stroke="#2EC4B6" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="6 5"/>',
    captain: '<path d="M20 36c4-16 56-16 60 0z" fill="#F7F7F2" stroke="#2B2F2E" stroke-width="3"/><path d="M16 38c20-6 48-6 68 0-2 4-10 6-34 6S18 42 16 38z" fill="#2B2F2E"/><path d="M44 26l6-5 6 5-6 5z" fill="url(#gold)" stroke="#A9780C" stroke-width="1.5"/>',
    horns: '<path d="M30 32c-6-6-7-14-3-20 3 7 8 10 13 12M70 32c6-6 7-14 3-20-3 7-8 10-13 12" fill="#3B2C5E" stroke="#22183A" stroke-width="2.5" stroke-linejoin="round"/>',
    shades: '<path d="M27 48h20l-2 9c-1 3-4 4-8 4s-8-1-9-4zM53 48h20l-1 9c-1 3-5 4-9 4s-7-1-8-4z" fill="#1D2321"/><path d="M47 50h6" stroke="#1D2321" stroke-width="3"/><path d="M76 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#FFE27A" stroke="#E9A81C" stroke-width="1.2"/>',
    aura: '<ellipse cx="50" cy="57" rx="46" ry="44" fill="none" stroke="#FFE9A8" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round" opacity=".9"/><circle cx="50" cy="11" r="4" fill="#FFE9A8"/>'
  };
  // Some accessories replace the eyes; those rivals keep a closed-eye or masked look.
  const OVER_FACE = { glasses: true, mask: true, shades: true };

  function rival(accessory, mood) {
    const t = TEAM[1], b = BODY[CROWN];
    const acc = ACCESSORY[accessory] || '';
    const onHead = accessory === 'beanie' || accessory === 'captain' || accessory === 'bunny' || accessory === 'sweatband';
    const m = accessory === 'aura' && (mood === 'calm' || mood === 'focus') ? 'sleepy' : mood;
    return `<svg class="art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
      (accessory === 'aura' ? acc : '') +
      `<path class="body" d="${b.d}" fill="url(#body-red)" stroke="${t.line}" stroke-width="3.2" stroke-linejoin="round"/>` +
      `<path d="M30 33q8-8 20-9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45"/>` +
      (onHead ? '' : CROWN_CAP) +
      face(1, m || 'calm', CROWN) +
      (accessory !== 'aura' ? `<g class="acc">${acc}</g>` : '') +
      `</svg>`;
  }

  // Self-contained gradients for standalone images (icon, splash), which cannot use the page's #defs.
  const STANDALONE_DEFS =
    `<radialGradient id="body-blue" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#7DB8FF"/><stop offset=".55" stop-color="#3D86F0"/><stop offset="1" stop-color="#2560C4"/></radialGradient>` +
    `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#E9A81C"/></linearGradient>` +
    `<linearGradient id="sweat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8F8FF"/><stop offset="1" stop-color="#8FD3F4"/></linearGradient>`;
  const inline = svg => svg.replace('<svg class="art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">', '<g>').replace(/<\/svg>$/, '</g>');

  /*
   * The app icon: a nervous Blue Crown on a warm sunrise. Used for the PWA and the App Store.
   * opts.maskable adds Android safe-zone padding. opts.variant 'dark' or 'tinted' draws the
   * iOS 18 home screen variants: the character alone on a transparent background (the system
   * supplies the dark backdrop), and a grayscale version for tinting.
   */
  function icon(size, opts) {
    opts = opts || {};
    const pad = opts.maskable ? 18 : 10;
    const bare = opts.variant === 'dark' || opts.variant === 'tinted';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
      `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD36B"/><stop offset="1" stop-color="#FF7A59"/></linearGradient>` +
      STANDALONE_DEFS + `<filter id="gray"><feColorMatrix type="saturate" values="0"/></filter></defs>` +
      (bare ? '' : `<rect width="100" height="100" fill="url(#bg)"/><circle cx="50" cy="104" r="44" fill="#FFF3D6" opacity=".35"/>`) +
      `<g transform="translate(${pad} ${pad + 2}) scale(${(100 - 2 * pad) / 100})"${opts.variant === 'tinted' ? ' filter="url(#gray)"' : ''}>` +
      (bare ? '' : `<ellipse cx="50" cy="92" rx="30" ry="5" fill="#B4472F" opacity=".35"/>`) +
      inline(piece(CROWN, 0, 'nervous')) +
      `</g></svg>`;
  }

  /*
   * The launch splash (a square, cropped to fill any screen, so the art stays in the middle):
   * a calm Blue Crown over the wordmark on the app's own background, light or dark.
   * The wordmark is text in the display font; the renderer must have it loaded.
   */
  function splash(size, dark) {
    const bg = dark ? ['#10201B', '#08110E'] : ['#EAF4F0', '#D6E8E1'];
    const ink = dark ? '#E5EFEB' : '#14201C';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000">` +
      `<defs><linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>${STANDALONE_DEFS}</defs>` +
      `<rect width="1000" height="1000" fill="url(#sbg)"/>` +
      `<ellipse cx="500" cy="541" rx="54" ry="9" fill="#000" opacity="${dark ? '.35' : '.12'}"/>` +
      `<g transform="translate(410 375) scale(1.8)">${inline(piece(CROWN, 0, 'calm'))}</g>` +
      `<text x="500" y="636" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="800" font-size="56" letter-spacing="3.4" fill="${ink}">STRESS</text>` +
      `</svg>`;
  }

  root.StressArt = { defs, piece, face, rival, icon, splash, ACCESSORY, TEAM };
})(typeof self !== 'undefined' ? self : this);
