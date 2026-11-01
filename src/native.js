/* Glue for the iOS app shell (Capacitor). The native side injects
   window.Capacitor.Plugins before any page script runs, so no bundler is
   needed. In a browser every call here does nothing.

   - The launch splash stays up until the first screen has painted, so there
     is never a blank frame. A safety timer takes it down regardless.
   - Status bar text follows the in-app Appearance setting. */
(function (root) {
  'use strict';
  const cap = root.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const plugin = name => (isNative && cap.Plugins && cap.Plugins[name]) || null;
  const quiet = p => { if (p && typeof p.catch === 'function') p.catch(() => { /* not fatal */ }); };
  let splashDown = false;

  function ready() {
    if (splashDown) return;
    splashDown = true;
    const s = plugin('SplashScreen');
    if (s) quiet(s.hide({ fadeOutDuration: 250 }));
  }

  // 'auto' follows the system; 'dark' wants light text; 'light' wants dark text.
  function appearance(mode) {
    const sb = plugin('StatusBar');
    if (sb) quiet(sb.setStyle({ style: mode === 'dark' ? 'DARK' : mode === 'light' ? 'LIGHT' : 'DEFAULT' }));
  }

  if (isNative) setTimeout(ready, 3000);
  root.StressNative = { isNative, ready, appearance };
})(typeof self !== 'undefined' ? self : this);
