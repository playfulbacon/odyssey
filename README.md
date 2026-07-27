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
line turns gold — and your paddle is frozen where you left it.

## Reading the field

**Cool is safe, warm will cost you a life.** Shape says the same thing a second
time — collectables are an **O**, obstacles an **X** — so you never have to pick
a single signal out at speed.

Among collectables the hue is only identity. Among obstacles it is not: **the
warm hue names the gate**, the one thing that makes the obstacle safe to touch.
Two obstacles that open the same way look the same, and an obstacle's colour is
*derived* from its gate in code, so the picture cannot drift from the rules.

| | |
|---|---|
| **red** | nothing gets through. Ever. |
| **orange** | safe only to a boosted ball. |
| **gold** | safe only with both fingers off the glass. |
| **pink** | safe only during its dark window. |

Two colours belong to neither family, and they are the two that carry rules:

- **violet** — the boosted ball, and *every* breakable ring in the game. A ring
  means one thing everywhere: only a boosted ball takes it off. Collectable
  shields and obstacle armour are the same material.
- **ink** — the ball at rest, the paddles, a half of the line someone is holding.

The ball reports one thing and one thing only: violet means it can break a ring.
The other state lives on **the line**, which is where it belongs — each half
reports its own player. A half nobody is holding turns gold, and when both
halves are gold the PHANTOM is open. That is why they are the same colour.

## Pieces

**Collectables** wear rings, and rings work the same here as they do on an
obstacle: only a boosted pass strips them, *ball power* rings at a time. An
unboosted ball goes straight through and does nothing. Once the last ring is
gone the core fills in — touch it again, boosted or not, to bank it.

The **MOTE** is the exception: no rings at all, just touch it. Run 1 is nothing
but motes, so the first run asks only that you can steer the line; the ring rule
arrives with the ORB on run 2.

| | rings | pays | behaviour |
|---|---|---|---|
| **MOTE** | — | 60 | No rings. Touch it and it is banked. The plainest thing in the game, and it never grows rings however deep the run gets. |
| **ORB** | 1 | 100 | Static. The plain one. |
| **DRIFTER** | 2 | 190 | Wanders, bounces off the walls; a stub shows where it came from. |
| **SPLITTER** | 2 | 110 | A double O. Bursts into three already-open shards when cracked. |
| **RUNNER** | 1 | 260 | Small, fast, with a draining arc for its patience. |

**Obstacles** cost a life on the wrong kind of contact. The breakable ones have
armour and pay far more than any collectable, because getting them wrong is
expensive.

| | wears | rings | pays | safe to touch with |
|---|---|---|---|---|
| **SLAB** | red | — | — | nothing. Move the line around it. |
| **ROTOR** | red | — | — | nothing, and it sweeps toward you. |
| **BRITTLE** | orange | 3 | 430 | a boosted ball. |
| **PULSAR** | pink | 2 | 340 | anything, during its dark window. |
| **PHANTOM** | gold | 1 | 700 | both fingers off the glass. |

The PULSAR is the timing one: lit and wide it kills, dark and small it is inert.
It never changes hue, because its gate never changes — only the window does.

The PHANTOM carries two gates at once, so it only has one ring: you are safe to
coast through it with both hands off, and a boost that is *still alive* in that
same window destroys it outright.

Everything fades in behind a dashed telegraph ring and is inert until it lands.

Because every ring needs a boost, the alternating lift is the game's basic
rhythm rather than a trick for one obstacle: you each shove as the ball runs
away from you, so it is violet in both directions and can break anything it
crosses. A PHANTOM is the one piece that wants you to stop doing that — line it
up, then one of you lifts, then the other, before the first shove dies.

**Launching.** At the start of a run, and after every lost life, both players
hold their half until the bar fills. A lost ball comes back on the paddle of the
player it was heading toward.

## Runs

Each run is a clock and a score to beat. Clear it and you spend your points on
upgrades — lives, ball power, run time, boost duration — before the next one,
which brings a bigger target and a nastier field. Miss the target
or burn every life and the game is over. Score carries across runs, so the
question is how deep you can get.

Both sides ramp a piece at a time. Collectables: `MOTE`, then `ORB`, `DRIFTER`,
`SPLITTER`, `RUNNER` by run 5. Obstacles: `SLAB`, then `BRITTLE`, `PULSAR`,
`PHANTOM`, `ROTOR` on the same schedule.

## Playground

A no-clock, no-target, endless-lives sandbox with one page per collectable and
per obstacle, so a mechanic can be learned (or re-tuned) in isolation. Obstacle
pages also spawn ringless motes, so the practice loop is pure dodging.

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
difficulty curve. `src/entities.js` holds the palette, the gate table, and each
piece's own numbers (rings, payout, speed) alongside the blurb the playground
shows. An obstacle's colour is not written down anywhere: it comes from its
gate, so adding a piece means picking a gate, not picking a hue.

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
