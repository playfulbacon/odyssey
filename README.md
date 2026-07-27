# ODYSSEY

A two-player co-op game that runs on one phone. Lay the phone flat between you,
held vertically. One player sits at each end and owns the half of the screen
nearest them.

This is a **mechanics prototype** — everything is playable end to end, but it is
built to be poked at and re-tuned rather than shipped.

## The idea

A paddle sits at each end of the screen and a line is stretched between them.
The ball runs back and forth *along that line*. Moving your paddle swings the
whole line, so aiming is a two-person job: you are both steering the same piece
of string through the field.

**Slide** anywhere on your half to move your paddle. Dragging is relative — the
paddle never teleports to a new touch, because you will be lifting your finger
constantly.

**Lift** your finger to shove the ball away from you. For a moment it flies. A
lift does nothing to a ball coming the other way, and if you both lift at once
the two shoves cancel out. While your finger is off the glass your half of the
line fades — and your paddle is frozen where you left it.

## Reading the field

Shape tells you the family, colour tells you the state, and the ball wears its
own state — so the whole game reduces to one rule: **make the ball the same
colour as the thing you want to go through.**

That is not a label stuck on the mechanic. `resolveObstacle()` is literally a
colour comparison between what the obstacle is wearing and what the ball is
wearing; there is no second rule hiding behind it.

| | |
|---|---|
| **O** | collectable — break its rings, then touch the core |
| **X** | obstacle — a life, unless the colours agree |
| **INK** | nothing required. The ball is ink at normal pace. |
| **FORCE** teal | the boosted ball — and every ring the ball can break, on collectables and obstacles alike |
| **GHOST** violet | both fingers off the glass |
| **HAZARD** red | lethal right now. The ball is never this colour, so red never opens. |

The ball holds one key at a time, and GHOST outranks FORCE: letting go with both
hands is a deliberate choice and should not be masked by a shove that has not
faded yet. It also means the boost rhythm has to keep one finger down.

## Pieces

**Collectables** wear a shield. Every pass of the ball strips *ball power* off
it. Once the shield is gone the core is exposed; touch it again to bank it.

All four are an **O** ringed in FORCE teal; they differ by structure and motion,
never by a colour that means nothing.

| | rings | pays | behaviour |
|---|---|---|---|
| **ORB** | 1 | 100 | Static. The plain one. |
| **DRIFTER** | 2 | 170 | Wanders, bounces off the walls; a stub shows where it came from. |
| **SPLITTER** | 3 | 90 | A double O. Bursts into three loose shards when cracked. |
| **RUNNER** | 1 | 240 | Small, fast, with a draining arc for its patience. |

**Obstacles** cost a life on the wrong kind of contact. The breakable ones have
armour and pay far more than any collectable, because getting them wrong is
expensive.

| | wears | armour | pays | opens to |
|---|---|---|---|---|
| **SLAB** | HAZARD | — | — | nothing. Move the line around it. |
| **ROTOR** | HAZARD | — | — | nothing, and it sweeps toward you. |
| **BRITTLE** | FORCE | 3 | 430 | the teal, boosted ball. |
| **PHANTOM** | GHOST | 2 | 660 | the violet ball — both fingers off. |
| **PULSAR** | HAZARD ⇄ INK | 2 | 320 | a plain ball, but only while it is dark. |

The PULSAR is the one that changes colour instead of asking you to: red and wide
while lit, ink and small while dark.

Everything fades in behind a dashed telegraph ring and is inert until it lands.

Breaking a BRITTLE takes three teal passes, and arriving any other colour kills —
so the co-op rhythm it wants is the two of you *alternating* lifts, each shoving
as the ball runs away from you, keeping it teal in both directions. Because one
of you is always still holding, the ball never slips to GHOST mid-rhythm. A
PHANTOM wants the exact opposite: line it up, then both let go and coast.

**Launching.** At the start of a run, and after every lost life, both players
hold their half until the bar fills. A lost ball comes back on the paddle of the
player it was heading toward.

## Runs

Each run is a clock and a score to beat. Clear it and you spend your points on
upgrades — lives, ball power, run time, paddle width, boost duration — before
the next one, which brings a bigger target and a nastier field. Miss the target
or burn every life and the game is over. Score carries across runs, so the
question is how deep you can get.

The threat ramps piece by piece: `SLAB` from run 1, then `BRITTLE`, `PULSAR`,
`PHANTOM` and `ROTOR` by run 5.

## Playground

A no-clock, no-target, endless-lives sandbox with one page per collectable and
per obstacle, so a mechanic can be learned (or re-tuned) in isolation. Obstacle
pages also spawn plain orbs so there is something to weave toward.

## Running it

Any static server works — it is plain ES modules with no build step.

```sh
npm start                  # http-server on :8080, opens a browser
# or
python3 -m http.server 8080
```

Then open `http://<your-machine>:8080` on the phone (same Wi-Fi), or push to
GitHub Pages — `.github/workflows/pages.yml` deploys the repo root as-is.

Add the page to your home screen for a fullscreen, chrome-free run.

### Testing on a desktop

The whole thing is playable from the keyboard, which is how the automated tests
drive it. You only move while you are "holding", exactly like a finger.

| | hold | slide |
|---|---|---|
| Bottom player | <kbd>S</kbd> | <kbd>A</kbd> <kbd>D</kbd> |
| Top player | <kbd>K</kbd> | <kbd>J</kbd> <kbd>L</kbd> |

<kbd>Esc</kbd> pauses. The mouse also works as a single player. On a wide window
the field is letterboxed to a phone aspect ratio so it plays the same.

```sh
npm test     # rules tests: obstacle matrix, boost maths, shields, economy
npm run check
```

## Layout

```
index.html      shell + menu markup
styles.css      overlay styling (the game itself is all canvas)
src/config.js   every tuning number, the upgrade table, the difficulty curve
src/entities.js the piece registry, factories, behaviour and hit tests
src/input.js    two-player pointer/keyboard model
src/game.js     the simulation
src/render.js   all drawing
src/ui.js       menus, playground list, shop, results
src/audio.js    a tiny synth, no assets
test/           rules tests (node --test)
```

### Tuning

`src/config.js` is the whole dial board — ball pace, boost strength and
duration, launch hold time, run targets, upgrade prices, and the per-run
difficulty curve. `src/entities.js` holds each piece's own numbers (shield,
armour, payout, speed) alongside the blurb the playground shows.

While a run is open, `window.__g` is the live game and `window.__odyssey` the
meta-game, so values can be poked from the console mid-play.

## Known rough edges

- The menus, shop and results screens read one way up. The in-game HUD is a
  single strip stood on its side against the left edge, opposite the pause
  button, so it is square to neither player rather than upside down for one.
  During the launch ritual each paddle also reports its own player's hold, so
  neither of you has to read a prompt meant for the other.
- Balance is a first pass. Run 1 is deliberately gentle; the later curve has had
  no real playtesting.
- No haptics, and audio is a handful of synthesised blips.
