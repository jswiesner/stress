/* Haptic feedback. In the iOS/Android app (Capacitor) this uses the native
   Haptics plugin; in a browser it falls back to the Vibration API where one
   exists (Android). iPhone browsers have no vibration API, so the web build is
   silent there by design. */
(function (root) {
  'use strict';
  let enabled = true, selecting = false; // iOS selection ticks need selectionStart() once first
  const native = () => root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.Haptics;
  const vibrate = p => { try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(p); } catch (e) { /* unsupported */ } };

  const KINDS = {
    tap: [h => h.impact({ style: 'LIGHT' }), 8],
    impact: [h => h.impact({ style: 'MEDIUM' }), 16],
    heavy: [h => h.impact({ style: 'HEAVY' }), [22, 40, 22]],
    select: [h => { if (!selecting) { selecting = true; h.selectionStart(); } h.selectionChanged(); }, 5],
    success: [h => h.notification({ type: 'SUCCESS' }), [12, 50, 12, 50, 30]],
    warning: [h => h.notification({ type: 'WARNING' }), [30, 60, 30]]
  };

  root.StressHaptics = {
    play(kind) {
      if (!enabled || !KINDS[kind]) return;
      const h = native();
      try { if (h) KINDS[kind][0](h); else vibrate(KINDS[kind][1]); } catch (e) { /* ignore */ }
    },
    setEnabled(on) { enabled = !!on; },
    get available() { return !!native() || !!(root.navigator && root.navigator.vibrate); }
  };
})(typeof self !== 'undefined' ? self : this);
