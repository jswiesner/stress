# Stress 3.0: from side project to the charts

*A product review of Stress 2.0 and the plan behind 3.0, written as the brief a chart-focused mobile studio would work from.*

---

## The short version

Stress 2.0 has the hardest part already: an original core that is quick, readable and hard to put down once you get it. Raids, nerve and a Stress race make every move a push and pull between attack and retreat, and the simulator shows games that end decisively in about three minutes.

What it lacks is everything around the core that makes a mobile game chart: a reason to come back tomorrow, characters people care about, a first minute that teaches by playing, a ladder of goals, game feel, and a store presence. 3.0 builds all of that on top of the unchanged rules.

## What 2.0 gets right

- **An original core.** Raids reward pressure, nerve punishes greed, and the Crown adds a sudden-death threat. It is chess-flavored without asking for a chess player's commitment.
- **Short, decisive games.** In 400 games of the level-6 computer against itself there were no draws and the median game was 48 moves. Only 4% reached the 40-round limit.
- **A credible opponent.** Nine calibrated levels, a worker thread so the board never freezes, and adaptive difficulty.
- **Kindness.** Undo, no move timer and autosave. That restraint is right for a game called Stress, and 3.0 keeps all of it.

## Why 2.0 would not chart

These are listed in order of how much each one costs in installs and retention.

1. **No reason to come back.** There is no daily content, streak, goal or collection. A good first session followed by nothing gives no day-1 retention, and without retention no amount of marketing helps. *Fix: a daily puzzle with a streak and a share card, a ladder of rivals, stars, XP and unlockable boards.*
2. **No faces.** The pieces were abstract glyphs (+, ×, L). Nobody screenshots a plus sign or tells a friend about one. Characters are what turn a store visitor into an install, and an install into attachment. *Fix: expressive pebble characters whose shape encodes their movement and whose faces react to the game.*
3. **A rules page before the first move.** Seven rules and a table come before any play. Mobile players skip text, and the ones who don't are already bored by the end. *Fix: a 60-second interactive tutorial that teaches one idea per tap and ends in a win.*
4. **"Level 6" is not a story.** A numbered difficulty slider gives no goal, no anticipation and no sense of a journey. *Fix: ten named rivals, each with a personality, a play style, voice lines and three stars to earn.*
5. **Weak game feel.** Moves slide and raids tick. A tactile game needs squash and stretch, impact, shake, haptics and a little celebration. *Fix: a full juice pass (hop, squash, screen shake, sparks, floaters, confetti, haptics, ambient music).*
6. **Only one thing to do.** A game needs a second loop that fits in 60 seconds, the waiting-in-line moment. *Fix: puzzles. There are 150 in three packs and 120 dailies, each one proven by an exact solver.*
7. **Not an app.** There was no icon, offline support, native shell, screenshots or listing. *Fix: the full kit is in this branch.*

## Positioning

- **One line:** *The three-minute strategy duel.*
- **For** people who like the thinking in chess but not the half-hour commitment, the rating anxiety or the toxicity of online play. It suits commutes, coffee breaks and winding down.
- **Promise:** a real game of wits that leaves you calmer, not more wound up. Play takes three minutes, puzzles take one, and there are no ads, timers or energy bars.
- **Tone:** cozy and cheeky. The rivals tease and the pieces sweat, but the player is never punished for leaving or losing.

## What 3.0 ships

| Pillar | What's in the build |
|---|---|
| **Characters** | Every piece is a pebble character whose body tells you how it moves. The Guard is square (straight lines), the Runner a diamond (diagonals), the Jumper has bunny ears (hops) and the Crown wears its crown. Faces show eight moods: calm, focus, nervous with a sweat drop, panic when the Crown is attacked, happy, sad, cracked and sleepy. |
| **First minute** | A five-lesson interactive tutorial (raid, nerve, capture, crack, crown) on real positions. One idea per tap, about 60 seconds, ending in a win and the first level-up. Skippable. |
| **Rivals** | Ten opponents from Pip to The Monk. Each has a distinct style built into the real search (raid appetite, greed, Crown safety, Crown hunting), plus a portrait, a quote and voice lines for greeting, hurting, landing hits and winning. Three stars each (win; win at 5 Stress or less; win at 2 or less) make 30 stars. |
| **Daily** | One puzzle a day for everyone, a streak of consecutive days, and a spoiler-free share card. There are 120 dailies, about four months, in a deliberate 2-2-1-3-2-2-3 weekly rhythm. |
| **Puzzles** | Warm-up (40, win in 1), Tactics (60, win in 2) and Mastery (50, win in 3). The next pack unlocks after five solves. The defender always plays the most stubborn reply, and hints are free. |
| **Progression** | XP and 20 levels whose titles run from *Rattled* to *Zen Master*, 16 achievements, and six boards to unlock (Mist, Sakura, Matcha, Midnight, Sunset and Gold Leaf). |
| **Game feel** | Pieces hop with squash and stretch, the screen shakes on captures, sparks fly on raids, Stress floats up as "+1", cracked raiders shatter, and wins end in confetti. Generative ambient music plays, with native haptics on iPhone. |
| **Respect** | No ads, energy, accounts or tracking. Undo is always available and games autosave. Light and dark themes, reduced-motion support, and a screen-reader description of the board. |
| **App** | Works offline (service worker, self-hosted fonts). Includes an iOS project (Capacitor) with native haptics, a branded launch splash and status bar handling, light, dark and tinted iOS icons, a portrait iPhone layout, and iPad layouts for portrait and landscape. App Store screenshots, listing copy, privacy and support pages, and release steps are included. |

The rules did not change. 2.0's balance work (no draws, short games, a calibrated ladder) is the foundation, and 3.0 builds on it.

## The loops

**Session (about 3 minutes):** pick a rival, play the duel, see the results (stars, XP bar, unlocks, achievements), then *Next rival* or *Play again*. The results screen always offers a next step, and a loss always comes with a specific tip.

**Daily (about 1 minute):** open the app, the daily card shows the streak flame, solve, share, and come back tomorrow. A broken long streak is a common reason people quit daily games, so a weekly "rest day" that keeps the streak alive through one missed day is high on the next-steps list.

**Long term (weeks):** 30 stars across 10 rivals, 150 pack puzzles, 20 levels, 16 achievements and 6 boards. Every reward is cosmetic or bragging rights, and nothing is a gate except the next rival.

## The first ten minutes

| Time | What happens | Why |
|---|---|---|
| 0:00 | The app opens straight into lesson 1. There is no menu, sign-up or permission prompt. | Every screen before the first move loses players. |
| ~1:00 | Tutorial complete: "You're ready!", +100 XP and a level-up. | The first session should end in a win. |
| ~1:30 | Pip, the first rival, says hello. Pip is built to lose (level 1) but plays a real game. | The first opponent is a confidence builder, not a test. |
| ~5:00 | First rival win: stars, XP and the next rival revealed. | This is the core loop shown once, end to end. |
| ~6:00 | The home screen's daily card and puzzle tiles invite a 60-second side quest. | It introduces the second loop and plants the habit. |
| ~10:00 | Two or three rivals in, the first board (Sakura, 5 stars) is within reach. | There is always a goal one session away. |

## App Store optimization

The full copy is in [`store/listing.md`](../store/listing.md). The key decisions:

- **Name:** *Stress: Pocket Strategy.* "Stress" alone collides with wellness apps in search, so the suffix tells both people and the search index what the app is.
- **Subtitle:** *Chess-like duels in 3 minutes.* "Chess" is the highest-intent keyword in the category, and "3 minutes" is the differentiator.
- **Category:** Games, Board (primary) and Strategy (secondary). Board is a smaller, less crowded chart than Puzzle or Strategy, so it is the realistic first chart to climb.
- **Screenshots:** six frames that tell the story in order: the duel, rivals, daily, the one-minute tutorial, rewards, and calm by design (dark mode). Captions are short and the first two frames carry the pitch, because most visitors never scroll.
- **Icon:** the nervous blue Crown on a sunrise gradient. It is one character, one emotion and readable at 40 px. Run icon A/B tests (Product Page Optimization) against a calm or happy Crown after launch.
- **Ratings:** ask for a review (`SKStoreReviewController`) only right after a happy moment, such as a first 3-star win or a 7-day streak. Never ask after a loss, and never more than the system allows. *(Not yet wired; see the next steps below.)*

## Monetization

Recommendation: **launch free with no ads, then add one optional purchase.**

- **3.0 at launch:** everything free. The goal of launch is ratings, retention data and a shot at editorial featuring. A paywall on day one hurts all three.
- **3.1, "Stress Plus" (one-time purchase, about $4.99):** new content only, so nothing a player already has goes behind a paywall. It would include new puzzle packs, extra boards, rival costumes and future rivals, plus a supporter badge. Implement it with StoreKit 2 (for example RevenueCat's Capacitor SDK), with Family Sharing and Restore Purchases.
- **Never:** interstitial ads, energy systems, paid continues or loot boxes. Any of them would contradict the name and the review score.

A subscription is the wrong fit for a cozy game with finite content. A one-time unlock matches what players expect from premium-feeling puzzle and board games.

## Measuring it

No analytics SDK ships in 3.0, so the privacy label can honestly say **Data Not Collected**. App Store Connect already reports impressions, product page conversion, installs, sessions, retention (for users who share analytics with developers) and crashes, without any code.

Targets to hold launch against. These are goals, not measurements:

| Metric | Target |
|---|---|
| Day-1 retention | 40% |
| Day-7 retention | 15% |
| Day-30 retention | 6% |
| Tutorial completion | 85% |
| First rival beaten on day 1 | 70% |
| Average rating | 4.6+ |

If in-game funnels are needed later (tutorial drop-off, rival win rates), add a privacy-first tool such as TelemetryDeck, update the privacy label, and keep it anonymous.

## Launch checklist

1. **TestFlight** for 2–4 weeks with friends, then a public link. Watch crashes, tutorial completion (ask testers) and which rival people stall on.
2. **App Store Connect:** create the app record and fill in the privacy label (Data Not Collected), the age rating (4+), the support and privacy URLs, screenshots and the review notes (no login needed).
3. **Featuring:** submit a featuring nomination in App Store Connect 6–8 weeks before launch, with the story "a strategy game designed to calm you down."
4. **Launch day:** publish an In-App Event for the daily puzzle streak, post the share card format on social media, and invite TestFlight testers to rate.
5. **First month:** ship a small update every 2–3 weeks (new dailies, a board, quality fixes). Steady updates signal a live game, to players and to editors.

## Risks, plainly

- **Search collision.** "Stress" also means anxiety apps. The name suffix and subtitle handle discoverability, and the review notes should make the game obvious to App Review.
- **Strategy is a smaller casual niche.** The three-minute format, the characters and the daily puzzle are what make it accessible beyond chess players. Keep the tutorial and Pip easy.
- **Web-view shell.** Apple rejects thin website wrappers under guideline 4.2. Stress is a complete offline game with native haptics, splash and status bar handling, so it clears that bar, but the review notes say so explicitly.
- **Content runway.** 120 dailies last about four months, and the puzzle pipeline (`tools/puzzles`) can generate and prove more on demand. Schedule a top-up before the set runs out.

## Next steps, by impact

1. **Ship it:** sign, upload and run TestFlight. This needs a Mac and the Apple Developer Program. The steps are in [`docs/ios-release.md`](ios-release.md).
2. **Review prompt** after happy moments (a tiny native plugin call), and a weekly **rest day** for the daily streak.
3. **Game Center:** leaderboards for stars and longest streak, with achievements mirrored to the 16 in-game ones.
4. **Stress Plus** (3.1) with the first new puzzle pack and two boards.
5. **Localization:** Spanish, German, French, Japanese, Brazilian Portuguese and Korean. The text is short and the rival lines are the only creative-writing work.
6. **An app preview video** (15–30 seconds of a real duel ending in a crack and confetti).
7. **Android:** the same web app with Capacitor's Android shell. Haptics and offline play already work there.
