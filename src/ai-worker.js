/* Runs the computer opponent off the main thread so the board never freezes. */
/* global StressRules, StressAI */
importScripts('rules.js', 'ai.js');

self.onmessage = function (e) {
  const req = e.data || {};
  try {
    const state = StressRules.deserialize(req.state);
    const result = StressAI.chooseMove(state, { level: req.level, seed: req.seed });
    self.postMessage({ id: req.id, result: result });
  } catch (err) {
    self.postMessage({ id: req.id, error: String(err && err.message || err) });
  }
};
