# Stress 2.0

*Keep calm. Stress them out.*

A quick chess-flavored duel for a few spare minutes. Raid your opponent's half to pile on Stress, pull your raiders back before they crack, and keep your Crown safe. First to 10 Stress loses, and games can't stall: after 40 rounds the calmer player wins.

Play the computer (nine levels that adapt to you) or pass and play with a friend. It runs in any modern browser, on phones and desktops, with nothing to install.

## How to play

1. **Board.** 7×7. The three rows nearest you are your half. The middle row is neutral.
2. **Pieces.** Each side has a Crown, 2 Guards, 2 Runners and 2 Jumpers, lined up on the back row: Guard, Jumper, Runner, Crown, Runner, Jumper, Guard.
3. **Your turn.** Move one piece. Land on an enemy piece to capture it. The first move alternates from game to game.
4. **Raid.** At the start of your turn, each of your pieces in the enemy half adds 1 to your opponent's Stress.
5. **Nerve.** A raider can do that 3 times. After its third hit it cracks and leaves the board. Move it back to the middle row or your half and its nerve refills. Your Crown never cracks.
6. **Win.** Your opponent reaches 10 Stress, or you capture their Crown.
7. **Time limit.** If nobody has won after 40 rounds, the player with less Stress wins. If it's tied, play on until someone takes another point. (If 10 more rounds pass without a hit, the side with more pieces wins; equal pieces is a draw.)

| Piece | Icon | Moves |
|---|---|---|
| Crown | crown | 1 square in any direction |
| Guard | + | 1 or 2 squares straight; can't jump |
| Runner | × | 1 or 2 squares diagonally; can't jump |
| Jumper | L | an L: 2 squares one way, 1 to the side; hops over pieces |

## In the game

- **Against the computer:** nine levels, from Chill (1–3) through Steady (4–6) and Sharp (7–8) to Ruthless (9). Adaptive by default: you start at level 3, it gets one level harder when you win and one easier when you lose. You can also fix the level in Settings. The computer thinks in a Web Worker, so the board never freezes.
- **Two players:** pass and play on one device, with an optional clock (3 or 5 minutes each; run out and you lose).
- **Hints:** a picked-up piece shows its moves. Amber marks a square where it could be captured, red a move that loses or exposes your Crown. Tap an opponent's piece to see where it can go.
- **Calm by default:** no move timer against the computer, undo at any time (even after the game ends), automatic saving with *Continue game*, tips during your first game, light and dark themes, gentle sound, and reduced-motion support.

## Running it

There is no build step. Serve the folder with any static web server and open it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

Opening `index.html` straight from disk also works. Browsers block Web Workers on `file://`, so the computer then thinks on the page itself.

The site deploys to GitHub Pages through `.github/workflows/static.yml` on every push to the default branch.

## Project layout

```text
index.html          screens and markup
style.css           look and layout, light and dark
src/rules.js        the rules: pure logic shared by the page, the worker, the tests and the simulator
src/ai.js           the computer opponent (alpha-beta search, nine levels)
src/ai-worker.js    runs the opponent off the main thread
src/board-view.js   draws the board; animates moves, raids and cracks
src/app.js          screens, game flow, input, undo, saving, tips, the clock
src/storage.js      settings, progress and the saved game (localStorage)
src/sound.js        synthesized sound effects
tests/              node --test suites for the rules and the opponent
tools/sim/sim.js    computer-vs-computer simulator used to tune rules and levels
tools/e2e.js        browser test that plays whole games through the interface
```

## Tests

```sh
npm test            # rules and opponent: node --test tests/*.test.js
node tools/e2e.js   # full games in Chromium at phone and desktop sizes (needs Playwright)
```

The unit tests also run on GitHub Actions for every push and pull request (`.github/workflows/test.yml`).

## Tuning with the simulator

`tools/sim/sim.js` plays computer-vs-computer games with the real rules and the real opponent, and reports the numbers the design is tuned against: draws, game length, how often games reach the round limit, first-move advantage, comebacks, and which pieces earn the winning Stress.

```sh
node tools/sim/sim.js --blue 6 --red 6 --games 400   # one matchup
node tools/sim/sim.js --preset ladder                # every level against level 6
node tools/sim/sim.js --preset all                   # the full report
```

### Current numbers

Computer against itself at level 6 (400 games): no draws; 4% of games reach the 40-round limit and are decided by Stress there; the median game lasts 48 moves (24 per player); the first player wins 51%; there are 8.4 captures and 1.7 cracked raiders per game; and 59% of games end with the winner on 6 Stress or more.

Each level against level 6 (400 games per level, half with each color):

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Wins | 0% | 0% | 0% | 9% | 36% | 52% | 61% | 77% | 78% |

Level 9 is measured at its minimum depth. With its in-game thinking time (`--budget 600`) it beat level 8 in 89% of 80 games. Levels 1–3 are for beginners: a stand-in that moves at random but grabs captures wins 38%, 24% and 23% of its games against them.

A draw needs a tied sudden death that runs 10 extra rounds without a hit and leaves equal pieces. In about 5,900 simulated games that happened twice, both between two copies of level 9.

## Credits

Made by Paul.
