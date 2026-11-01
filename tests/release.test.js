'use strict';
// Release integrity: the offline cache, the iOS project and the store assets agree with the app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));
const quoted = s => (s.match(/'[^']+'/g) || []).map(x => x.slice(1, -1));

const html = read('index.html');
const sw = read('sw.js');
const shell = quoted(sw.match(/const SHELL = \[([\s\S]*?)\];/)[1]);
const pkg = JSON.parse(read('package.json'));
const cap = JSON.parse(read('capacitor.config.json'));
const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
const plist = read('ios/App/App/Info.plist');

function pngInfo(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', file + ' is a PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}
function jpegSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  for (let i = 2; i < b.length;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xC0 && marker <= 0xC2) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('no frame header in ' + file);
}

test('the offline cache holds every file the page and the worker load', () => {
  const refs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
  const worker = quoted(read('src/ai-worker.js').match(/importScripts\(([^)]*)\)/)[1]).map(f => 'src/' + f);
  for (const f of refs.concat(worker, ['src/ai-worker.js'])) assert.ok(shell.includes(f), f + ' is missing from sw.js SHELL');
  for (const f of shell.filter(f => f !== './')) assert.ok(exists(f), 'sw.js caches a file that does not exist: ' + f);
});

test('one version everywhere: package, app, offline cache and Xcode', () => {
  const v = pkg.version;
  assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.ok(read('src/main.js').includes("version: '" + v + "'"), 'StressApp.version');
  assert.ok(sw.includes("'stress-" + v + "'"), 'sw.js VERSION (bump it so players get the update)');
  const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1]);
  assert.ok(marketing.length >= 2 && marketing.every(m => m === v), 'Xcode MARKETING_VERSION ' + marketing);
});

test('the iOS project matches the Capacitor config', () => {
  assert.match(cap.appId, /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/i);
  assert.equal(cap.webDir, 'dist');
  const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(m => m[1]);
  assert.ok(ids.length >= 2 && ids.every(id => id === cap.appId), 'bundle id ' + ids);
  assert.equal(cap.plugins.SplashScreen.launchAutoHide, false, 'the app hides the splash itself');
  for (const dep of ['@capacitor/core', '@capacitor/ios', '@capacitor/haptics', '@capacitor/splash-screen', '@capacitor/status-bar']) assert.ok(pkg.dependencies[dep], dep);
});

test('Info.plist: name, portrait iPhone, every iPad orientation, no export compliance prompt', () => {
  const block = key => (plist.match(new RegExp('<key>' + key + '</key>\\s*<array>([\\s\\S]*?)</array>')) || [, ''])[1];
  assert.match(plist, /<key>CFBundleDisplayName<\/key>\s*<string>Stress<\/string>/);
  assert.deepEqual(block('UISupportedInterfaceOrientations').match(/UIInterfaceOrientation\w+/g), ['UIInterfaceOrientationPortrait']);
  assert.equal(block('UISupportedInterfaceOrientations~ipad').match(/UIInterfaceOrientation\w+/g).length, 4);
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
});

test('icons: an opaque 1024 App Store icon, iOS light/dark/tinted variants, web icons', () => {
  const store = pngInfo('store/icon-1024.png');
  assert.deepEqual([store.width, store.height, store.colorType], [1024, 1024, 2], 'App Store icon must be 1024x1024 RGB with no alpha');
  const set = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/';
  const contents = JSON.parse(read(set + 'Contents.json'));
  const kinds = contents.images.map(i => (i.appearances ? i.appearances[0].value : 'any'));
  assert.deepEqual(kinds.sort(), ['any', 'dark', 'tinted']);
  for (const img of contents.images) {
    const info = pngInfo(set + img.filename);
    assert.deepEqual([info.width, info.height], [1024, 1024], img.filename);
    if (!img.appearances) assert.equal(info.colorType, 2, 'the default iOS icon must be opaque');
  }
  const splash = JSON.parse(read('ios/App/App/Assets.xcassets/Splash.imageset/Contents.json'));
  for (const img of splash.images) assert.ok(exists('ios/App/App/Assets.xcassets/Splash.imageset/' + img.filename), img.filename);
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons) {
    const info = pngInfo(icon.src);
    assert.equal(info.width + 'x' + info.height, icon.sizes, icon.src);
  }
});

test('App Store screenshots exist at accepted sizes, six per device', () => {
  const sizes = { 'iphone-6.9': [1320, 2868], 'ipad-13': [2048, 2732] };
  for (const [dir, [w, h]] of Object.entries(sizes)) {
    const files = fs.readdirSync(path.join(ROOT, 'store/screenshots', dir)).filter(f => f.endsWith('.jpg')).sort();
    assert.equal(files.length, 6, dir);
    for (const f of files) assert.deepEqual(Object.values(jpegSize('store/screenshots/' + dir + '/' + f)), [h, w], dir + '/' + f);
  }
});

test('the pages the App Store listing links to exist', () => {
  for (const page of ['privacy.html', 'support.html']) {
    const text = read(page);
    assert.match(text, /<title>Stress: /, page);
    assert.ok(!/TODO|lorem/i.test(text), page + ' has placeholder text');
  }
  const listing = read('store/listing.md');
  for (const page of ['privacy.html', 'support.html']) assert.ok(listing.includes(page), 'listing links ' + page);
});
