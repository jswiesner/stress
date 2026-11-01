#!/usr/bin/env node
/*
 * Copies the shippable web app into dist/, the folder the iOS app (Capacitor)
 * bundles. The game has no build step of its own; this only leaves out the
 * tools, tests, docs and store assets, and checks that nothing is missing:
 * every script and asset the page loads, and every file the offline cache
 * (sw.js) expects, must be present.
 *
 *   node tools/build.js          # then: npx cap sync ios
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INCLUDE = ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'src', 'assets/fonts', 'assets/icons'];

function copy(rel) {
  const from = path.join(ROOT, rel), to = path.join(DIST, rel);
  if (fs.statSync(from).isDirectory()) {
    for (const name of fs.readdirSync(from)) copy(path.join(rel, name));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function referenced() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
  const worker = fs.readFileSync(path.join(ROOT, 'src/ai-worker.js'), 'utf8');
  const imports = (worker.match(/importScripts\(([^)]*)\)/) || [, ''])[1].match(/'[^']+'/g) || [];
  refs.push('src/ai-worker.js', ...imports.map(s => 'src/' + s.slice(1, -1)));
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [, ''])[1].match(/'[^']+'/g) || [];
  refs.push(...shell.map(s => s.slice(1, -1)).filter(s => s !== './'));
  return [...new Set(refs)];
}

fs.rmSync(DIST, { recursive: true, force: true });
INCLUDE.forEach(copy);
const missing = referenced().filter(rel => !fs.existsSync(path.join(DIST, rel)));
if (missing.length) {
  console.error('dist/ is missing files the app loads:\n  ' + missing.join('\n  '));
  process.exit(1);
}
let files = 0, bytes = 0;
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name), st = fs.statSync(p);
    if (st.isDirectory()) walk(p); else { files++; bytes += st.size; }
  }
})(DIST);
console.log('dist/ ready: ' + files + ' files, ' + (bytes / 1024).toFixed(0) + ' KB');
