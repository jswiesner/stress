/*
 * The Ladder: ten rivals, easiest first. Each plays at one of the computer's
 * nine calibrated levels with a small personality twist (style multipliers in
 * src/ai.js), wears an accessory (src/art.js) and has a few lines to say.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StressRivals = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RIVALS = [
    {
      id: 'pip', name: 'Pip', level: 1, acc: 'sprout', style: {},
      quote: 'Just happy to be here!', plays: 'Wanders. Leaves openings.',
      lines: { hello: 'Hi! Is it my turn yet?', hurt: 'Oops!', hit: 'Did I do that?', crown: 'Eek, my Crown!', win: 'I won? Wow!', lose: 'That was fun!' }
    },
    {
      id: 'bramble', name: 'Bramble', level: 2, acc: 'beanie', style: { raid: 1.3 },
      quote: 'I poke things to see what happens.', plays: 'Raids early, forgets to defend.',
      lines: { hello: 'Let’s poke around.', hurt: 'Hey, rude!', hit: 'Poke!', crown: 'Not the Crown!', win: 'Poked you to bits.', lose: 'You poke better.' }
    },
    {
      id: 'marlow', name: 'Marlow', level: 3, acc: 'glasses', style: { raid: 0.75, safety: 1.5 },
      quote: 'Slow and steady keeps the Stress away.', plays: 'Turtles up and waits for mistakes.',
      lines: { hello: 'No rush. None at all.', hurt: 'Hmm. Noted.', hit: 'Steady pressure.', crown: 'Ah. That’s close.', win: 'Patience pays.', lose: 'Well reasoned.' }
    },
    {
      id: 'juniper', name: 'Juniper', level: 4, acc: 'bunny', style: { raid: 1.3 },
      quote: 'Hop in, hop out, hop in again!', plays: 'Loves Jumper raids.',
      lines: { hello: 'Ready, set, hop!', hurt: 'Boing, ouch.', hit: 'Hop hop!', crown: 'Hop away, Crown!', win: 'Hopped right past you!', lose: 'You out-hopped me.' }
    },
    {
      id: 'ozzie', name: 'Ozzie', level: 5, acc: 'mask', style: { material: 1.3 },
      quote: 'I’ll be taking that.', plays: 'Grabs anything left unguarded.',
      lines: { hello: 'Nice pieces. Shame if...', hurt: 'Stolen from the thief!', hit: 'Pocketed.', crown: 'Hands off the loot!', win: 'Clean getaway.', lose: 'Caught red-handed.' }
    },
    {
      id: 'wren', name: 'Wren', level: 6, acc: 'sweatband', style: { raid: 1.25 },
      quote: 'Pressure is a privilege.', plays: 'Keeps raiders coming in waves.',
      lines: { hello: 'Let’s work up a sweat.', hurt: 'Good hit!', hit: 'Feel the burn?', crown: 'Defend! Defend!', win: 'Personal best!', lose: 'Rematch soon.' }
    },
    {
      id: 'calloway', name: 'Captain Calloway', short: 'Calloway', level: 7, acc: 'captain', style: { safety: 1.6, raid: 0.9 },
      quote: 'Nobody touches my Crown.', plays: 'Rock-solid defense, slow attacks.',
      lines: { hello: 'All hands on deck.', hurt: 'Man overboard!', hit: 'Broadside!', crown: 'Protect the Crown!', win: 'Steady as she goes.', lose: 'I yield, Captain.' }
    },
    {
      id: 'vex', name: 'Vex', level: 8, acc: 'horns', style: { hunt: 1.5, raid: 1.2 },
      quote: 'Panic is a choice. Yours.', plays: 'Hunts your Crown relentlessly.',
      lines: { hello: 'Nervous yet?', hurt: 'Lucky.', hit: 'Sweating?', crown: 'Clever. Very clever.', win: 'Told you to panic.', lose: 'Impossible...' }
    },
    {
      id: 'nova', name: 'Nova', level: 9, budget: 300, acc: 'shades', style: {},
      quote: 'I’ve seen how this ends. I win.', plays: 'Calculates deep. Rarely slips.',
      lines: { hello: 'Already calculated.', hurt: 'Unexpected.', hit: 'As predicted.', crown: 'Recalculating...', win: 'As foreseen.', lose: 'You broke my forecast.' }
    },
    {
      id: 'monk', name: 'The Monk', short: 'The Monk', level: 9, budget: 900, acc: 'aura', style: { safety: 1.2 },
      quote: 'Breathe in. Breathe out. Win.', plays: 'The calmest player alive.',
      lines: { hello: 'Be still.', hurt: 'Mm.', hit: 'Breathe.', crown: 'Even this is fine.', win: 'Calm wins.', lose: 'You have found your calm.' }
    }
  ];

  const SPARRING = {
    id: 'sparring', name: 'Sparring Stone', level: 0, acc: '', style: {},
    quote: 'Adapts to you, win or lose.', plays: 'Matches your level.',
    lines: { hello: 'Warm-up time.', hurt: 'Nice one.', hit: 'Got you.', crown: 'Close call!', win: 'Good game.', lose: 'Good game!' }
  };

  const byId = id => RIVALS.find(r => r.id === id) || (id === SPARRING.id ? SPARRING : null);
  const shortName = r => r.short || r.name;

  return { RIVALS, SPARRING, byId, shortName };
});
