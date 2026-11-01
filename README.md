# Stress 3.1

*Keep calm. Stress them out.*

A three-minute strategy duel with a lot of personality. Raid your rival's half to pile on Stress, pull your raiders back before they crack, and keep your Crown safe. First to 10 Stress loses.

3.0 turned the 2.0 game into an app built to compete on the App Store. It added characters whose faces react to every raid, a 60-second interactive tutorial, a ladder of ten rivals with their own play styles, a daily puzzle with a streak, solver-proven puzzle packs, XP and unlockable boards, and a native iOS shell. The rules are unchanged from 2.0.

3.1 is about puzzles. Two hard packs, Expert (win in 4) and Grandmaster (win in 5), join the three easier ones, for 250 pack puzzles in all. Every pack now runs from easiest to hardest, attempts are counted ("Solved on try 7"), a gold star marks a solve without a hint, and a *More puzzles* button follows the daily.

- **Why 3.0 looks like this:** [`docs/STRESS-3.0.md`](docs/STRESS-3.0.md), the product review of 2.0 and the plan (loops, first-time experience, store optimization, monetization, launch).
- **Shipping to the App Store:** [`docs/ios-release.md`](docs/ios-release.md).
- **Store copy and assets:** [`store/listing.md`](store/listing.md) and `store/screenshots/`.

## How to play

1. **Board.** 7×7. The three rows nearest you are your half. The middle row is neutral.
2. **Pieces.** Each side has a Crown, 2 Guards, 2 Runners and 2 Jumpers on its back row. Their shape tells you how they move.
3. **Your turn.** Move one piece. Land on an enemy piece to capture it.
4. **Raid.** At the start of your turn, each of your pieces in the enemy half adds 1 to your opponent's Stress.
5. **Nerve.** A raider can do that 3 times. After its third hit it cracks and leaves the board. Move it back to the middle row or your half and its nerve refills. Your Crown never cracks.
6. **Win.** Your opponent reaches 10 Stress, or you capture their Crown.
7. **Time limit.** After 40 rounds the calmer player wins. A tie plays on until the next point. If 10 more rounds pass without a hit, the side with more pieces wins; equal pieces is a draw.

| Piece | Character | Moves |
|---|---|---|
| Crown | wears a crown | 1 square in any direction |
| Guard | square body | 1 or 2 squares straight; can't jump |
| Runner | diamond body | 1 or 2 squares diagonally; can't jump |
| Jumper | bunny ears | an L: 2 squares one way, 1 to the side; hops over pieces |

## What's in the game

- **Tutorial:** five one-tap lessons (raid, nerve, capture, crack, crown) that end in a win. It starts on first launch and can be skipped or replayed.
- **Rivals:** Pip, Bramble, Marlow, Juniper, Ozzie, Wren, Captain Calloway, Vex, Nova and The Monk. Each one is a level of the real search with a personality on top (raid appetite, greed, Crown safety, Crown hunting) plus voice lines. Each has three stars: a win; a win at 5 Stress or less; a win at 2 or less.
- **Daily puzzle:** the same puzzle for everyone each day, with a streak and a spoiler-free share card. There are 120 dailies.
- **Puzzle packs:** Warm-up (40, win in 1), Tactics (60, win in 2), Mastery (50, win in 3), Expert (50, win in 4) and Grandmaster (50, win in 5). Each pack opens after five solves in the one before, and runs from easiest to hardest. From Tactics up exactly one first move wins (Warm-up allows two), and the defender always plays its most stubborn reply.
- **Misses explain themselves:** when a move doesn't force the win, Red plays its answer on the board and the message names it ("Red's Runner takes your Runner on c5"), so a tempting move that loses to one quiet reply never looks like the game's mistake.
- **Attempts and badges:** misses and restarts count as tries, even across sessions, so a hard solve says "Solved on try 7". A gold star marks a puzzle solved without a hint; solve a hinted one again cleanly to earn it.
- **Quick match:** a sparring partner whose level adapts, one level up after a win and one down after a loss.
- **Two players:** pass and play, with an optional 3- or 5-minute clock.
- **Progress:** XP and levels with titles from *Rattled* to *Zen Master*, 18 achievements and six boards to unlock.
- **Feel:** pieces hop and squash, raids spark, captures shake the screen, cracked raiders shatter, and wins end in confetti. There is generative ambient music, synthesized sound and native haptics in the iOS app.
- **Calm by default:** no ads, accounts, energy or move timers. You can undo at any time, games autosave, there are light and dark themes, motion respects the reduced-motion setting, and the board has a description for screen readers.
- **Offline:** the web build caches itself (service worker), and the iOS app bundles everything.

## Running it

There is no build step for the web version. Serve the folder and open it:

```sh
npm run serve        # python3 -m http.server 8000, then visit http://localhost:8000
```

Opening `index.html` from disk works too. Browsers block Web Workers on `file://`, so the computer then thinks on the page itself.

The site deploys to GitHub Pages through `.github/workflows/static.yml` on every push to the default branch. The deploy also serves `privacy.html` and `support.html`, the pages the App Store listing links to.

## iOS app

```sh
npm install          # Capacitor 8, the iOS platform and plugins
npm run ios          # copy the game into dist/ and sync it into ios/
npm run ios:open     # open the Xcode project (macOS)
```

See [`docs/ios-release.md`](docs/ios-release.md) for signing, TestFlight and submission.

## Project layout

```text
index.html             screens and markup
style.css              look and layout: light and dark, six boards, phone and tablet layouts
privacy.html           privacy policy (App Store requirement)
support.html           support page (App Store requirement)
manifest.webmanifest   installable web app
sw.js                  offline cache for the web build

src/rules.js           the rules: pure logic shared by the page, worker, solver, tests and tools
src/ai.js              the computer opponent: alpha-beta search, nine levels, rival styles
src/solver.js          exact forced-win search for puzzles (checking, defending, hints)
src/ai-worker.js       runs the opponent and the solver off the main thread
src/rivals.js          the ten rivals: levels, styles, lines
src/progress.js        XP, levels, stars, streaks, achievements, boards (pure, tested)
src/data/puzzles.js    250 pack puzzles and 120 dailies, generated by tools/puzzles
src/storage.js         profile, settings and saved game (localStorage), migration from 2.0
src/art.js             the characters, rival portraits, app icon and launch splash (SVG)
src/board-view.js      the board: moods, hops, sparks, cracks
src/match.js           a game in progress, in every mode: turns, puzzles, barks, tips, undo, clock
src/tutorial.js        the interactive tutorial
src/screens.js         home, rivals, puzzles, collection, settings, rules and results screens
src/main.js            the app shell: boot, navigation, sheets, starting each mode, sharing
src/sound.js           synthesized sound effects
src/music.js           generative ambient music
src/haptics.js         native haptics in the app, vibration on Android browsers
src/native.js          iOS shell glue: launch splash and status bar
src/fx.js              confetti and counters
src/icons.js           interface icons

ios/                   the Xcode project (Capacitor, Swift Package Manager)
capacitor.config.json  app id, name and plugin settings
store/                 App Store icon, screenshots and listing copy
docs/                  the 3.0 proposal and the release guide

tests/                 node --test suites: rules, opponent, solver and puzzles, progress, tutorial
tools/e2e.js           browser test that plays through every mode at three screen sizes
tools/build.js         copies the shippable files into dist/ for the iOS app
tools/icons.js         renders every icon and the splash from src/art.js
tools/store-shots.js   renders the App Store screenshots from the real app
tools/puzzles/         puzzle generation (self-play), deep 4- and 5-move puzzles, grading and building
tools/sim/sim.js       computer-vs-computer simulator used to tune the rules and levels
```

## Tests

```sh
npm test             # node --test tests/*.test.js
npm run e2e          # Chromium at phone, small dark phone and tablet sizes, plus file://
```

The unit tests check the rules, the opponent, that every puzzle is a forced win in exactly its number of moves and that the stored answer works, the progression math (XP, stars, streaks across months and years, unlocks, achievements) and the tutorial scripts. The browser test plays the tutorial, a rival (with undo), the daily and a pack puzzle using hints, a saved and resumed quick match, a two-player game on the clock, and every menu. It fails on any console error or sideways overflow.

The unit tests run on GitHub Actions for every push and pull request (`.github/workflows/test.yml`).

## Puzzles

Puzzles come from real games, and the exact solver (`src/solver.js`) proves every one: a forced win in exactly its number of moves whatever the defender does, with no shorter win, and from Tactics up a single winning first move.

- `tools/puzzles/generate.js` plays the computer against itself and keeps positions with a forced win in 1 to 3 moves.
- `tools/puzzles/deep.js` finds 4- and 5-move wins. It looks a few moves before the end of decisive games, where long forced wins hide, and stores each puzzle's whole line against the most stubborn defense, with how many moves win at each turn.
- `tools/puzzles/build.js` maintains the shipped collection. It removes near-duplicates within each pack and within the daily rotation, and refills each gap with a fresh, re-proven puzzle of similar difficulty that looks like nothing else in the collection. It grades every puzzle (how many computer levels from 2 to 8 miss the first move, a quiet first move, tempting captures that fail, how many defenses make you play the whole line), orders each pack easiest to hardest and adds new packs. Running it twice changes nothing.
- Two puzzles are near-duplicates if, compared directly or mirrored left to right (the rules are symmetric), at most one piece differs; or two, with the same answer or nearly the same Stress; or three on a busy board, with both the same. A test checks every pack and the daily rotation.
- `tools/puzzles/shipped.json` records every puzzle id ever shipped with its fingerprint, so an id always means the same puzzle and players' progress keeps its meaning. A removed puzzle's id is retired, never reused. Dailies from yesterday to three days ahead never change, and a replaced daily keeps its day.
- `tools/puzzles/curate.js --fresh` starts a whole new collection from `generate.js` output. It replaces ids and the daily rotation, so it isn't for the live game.

Deep puzzles never search on the phone: their stored line answers instantly, a wrong move at a turn with one winning move fails at once, and turns too deep to check quickly carry every other winning move with its reply. Shallow turns are checked by the solver, typically in about 10 milliseconds.

```sh
npm run puzzles:generate   # 1- to 3-move candidates (takes a while)
npm run puzzles:deep       # 4- and 5-move candidates: --minutes 90 --threads 3
npm run puzzles:build      # grade, order and add packs to src/data/puzzles.js
npm run puzzles:verify     # prove every puzzle exactly, including all deep ones (slow)
```

## Tuning with the simulator

`tools/sim/sim.js` plays computer-vs-computer games with the real rules and opponent and reports what the design is tuned against: draws, game length, first-move advantage, comebacks, and which pieces earn the winning Stress.

```sh
node tools/sim/sim.js --blue 6 --red 6 --games 400
node tools/sim/sim.js --preset ladder
```

Level 6 against itself (400 games): no draws, 4% of games reach the 40-round limit, the median game is 48 moves, and the first player wins 51%. Each level against level 6:

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Wins | 0% | 0% | 0% | 9% | 36% | 52% | 61% | 77% | 78% |

These numbers are for plain levels. A rival's style only changes how that rival weighs its own raids, material and Crown, so a style-free level plays exactly as measured here.

## Credits

Made by Paul. Fonts: [Figtree](https://github.com/erikdkennedy/figtree) and [Unbounded](https://github.com/googlefonts/unbounded), both under the SIL Open Font License (`assets/fonts/`).
