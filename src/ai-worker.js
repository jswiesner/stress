/* Runs the computer opponent and the puzzle solver off the main thread so the board never freezes. */
/* global StressRules, StressAI, StressSolver */
importScripts('rules.js', 'ai.js', 'solver.js');

self.onmessage = function (e) {
  const req = e.data || {};
  try {
    const state = StressRules.deserialize(req.state);
    let result;
    if (req.kind === 'defend') result = StressSolver.bestDefense(state, req.movesLeft, req.nodes || 3e6);
    else if (req.kind === 'hint') result = { moves: StressSolver.winningMoves(state, req.movesLeft, 3e6) };
    else result = StressAI.chooseMove(state, { level: req.level, seed: req.seed, style: req.style, budgetMs: req.budget });
    self.postMessage({ id: req.id, result: result });
  } catch (err) {
    self.postMessage({ id: req.id, error: String((err && err.message) || err) });
  }
};
