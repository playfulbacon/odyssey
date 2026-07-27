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
line breaks into faded dots — and your paddle is frozen where you left it. With
*both* of you off, the ball slows to a drift and turns gold.

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
| **gold, dotted** | safe only with both fingers off the glass. |
| **pink** | safe only during its dark window. |

## Shields

Only obstacles wear a shield, and **a shield is stripped by the state it is
drawn in**. There are two kinds, and the whole point is that they look nothing
alike:

- **Boost shield** — violet, solid. Stripped by a boosted ball.
- **Ghost shield** — gold, dotted. Stripped by a *ghosted* ball: one drifting
  with nobody holding the glass.

Anything else passes straight through and does nothing. Each good pass strips
*ball power* layers; when the last one goes, so does the thing inside.

## The ball is the readout

**The ball wears whatever it can currently strip**, and it is the only thing on
the field that changes colour:

| | | |
|---|---|---|
| **violet** | boosting | flying, and strips a boost shield |
| **gold** | ghosting | nobody holding, so it has slowed to a drift, and strips a ghost shield |
| **ink** | neither | strips nothing |

One state at a time, and **a shove already under way always finishes first** —
letting go of the second finger never snatches a boost away mid-flight. The
drift only starts once nothing is pushing.

The line stays ink throughout. All it reports is who is holding: solid for a
held half, faded dots for a released one. It is a readout of the input, not a
key, so it has no business changing colour.

A ghosted ball and a ghost shield are not similar-looking, they are the same
call: both come from `ghostStroke()`. `resolveObstacle()` asks the shield
whether the ball's current state breaks it, so the picture and the rule cannot
come apart.

## Pieces

**Collectables** are two pieces and neither is a puzzle. Touch one and it is
banked — no rings, no boost, no timing. They are not where the points are: a
collectable is tempo, and fuel for your multiplier. The obstacles are the income.

| | pays | behaviour |
|---|---|---|
| **MOTE** | 60 | Sits still and waits. |
| **DRIFTER** | 140 | The same mote, wandering. Bounces off the walls and never stops; a stub shows where it came from. |

**Obstacles** are the whole game. They cost a life on the wrong kind of contact,
and the breakable ones pay several times what a collectable does — they are the
only things on the field that can take anything from you. Shields live here and
nowhere else.

| | wears | shield | pays | safe to touch with |
|---|---|---|---|---|
| **SLAB** | red | — | — | nothing. Move the line around it. |
| **ROTOR** | red | — | — | nothing, and it sweeps toward you. |
| **BRITTLE** | orange | 3-layer boost | 430 | a boosted ball. |
| **PULSAR** | pink | 2-layer boost | 340 | anything, during its dark window. |
| **PHANTOM** | gold | 2-layer ghost | 700 | both fingers off the glass — though stripping it needs the drift to have actually started. |

An obstacle is two things: a **gate**, which says when it is safe to touch and
therefore what colour it wears, and a **shield**, which says what strips a layer.
For BRITTLE and PHANTOM those are the same condition — if the touch is safe, it
counts. The PULSAR is the one piece that separates them: a timing gate over a
boost shield, so a dark pulsar is safe to brush past but still needs a boosted
pass to break.

Everything fades in behind a dashed telegraph ring and is inert until it lands.

Because a boost shield needs a boost, the alternating lift is the basic rhythm
of scoring: you each shove as the ball runs away from you, so it is violet in
both directions. The PHANTOM is the one piece that wants the opposite — line it
up, then both of you let go, wait out whatever shove was still running, and
leave the glass alone while the slow gold drift saws through it.

**Launching.** At the start of a run, and after every lost life, both players
hold their half until the bar fills. A lost ball comes back on the paddle of the
player it was heading toward.

## Runs

Each run is a clock and a score to beat. Clear it and you spend your points on
upgrades — lives, ball power, run time, boost duration — before the next one,
which brings a bigger target and a nastier field. Miss the target
or burn every life and the game is over. Score carries across runs, so the
question is how deep you can get.

Run 1 is `MOTE`s and a `SLAB`: steer the line, dodge the red thing. The
`DRIFTER` joins on run 2, and the obstacles arrive one per run — `BRITTLE`,
`PULSAR`, `PHANTOM`, `ROTOR` — so each run teaches exactly one new idea.

## Playground

A no-clock, no-target, endless-lives sandbox with one page per collectable and
per obstacle, so a mechanic can be learned (or re-tuned) in isolation. Obstacle
pages also spawn motes, so the practice loop is pure dodging.

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

The whole thing is playable from the keyboard, and one person can drive both
sides. A finger does two jobs at once when it comes off the glass — it ends the
touch *and* shoves the ball — and on a keyboard those are split across two keys:

| | slide | boost |
|---|---|---|
| Bottom player | <kbd>A</kbd> <kbd>D</kbd> | <kbd>S</kbd> |
| Top player | <kbd>J</kbd> <kbd>L</kbd> | <kbd>K</kbd> |

**Steering keeps your side down.** Park both paddles and the ball ghosts — and
that is all parking does; letting go of a direction key never shoves the ball.
**The shove is a tap of the boost key**, which also holds your side down without
moving it. So you can line a phantom up, stop, and let the drift saw through it
without launching anything by accident.

The mouse works as a single player and does both jobs at once, like a finger.

<kbd>Esc</kbd> pauses. The mouse also works as a single player. On a wide window
the field is letterboxed to a phone aspect ratio so it plays the same.

```sh
npm test     # rules, input model, and a recording-canvas check on the picture
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
piece's own numbers (shield kind and layers, payout, speed) alongside the blurb the playground
shows. An obstacle's colour is not written down anywhere: it comes from its
gate, so adding a piece means picking a gate, not picking a hue.

While a run is open, `window.__g` is the live game and `window.__odyssey` the
meta-game, so values can be poked from the console mid-play.

## Known rough edges

- The menus, shop and results screens read one way up. The in-game HUD and the
  pause button are both strips stood on their sides against opposite edges, so
  they are square to neither player rather than upside down for one — and they
  face the same way, so turning the phone into landscape lands both of them
  upright at once. Rotation-locked, that gives you a playable landscape layout
  with a thumb at each end.
  During the launch ritual each paddle also reports its own player's hold, so
  neither of you has to read a prompt meant for the other.
- Balance is a first pass. Run 1 is deliberately gentle; the later curve has had
  no real playtesting.
- No haptics, and audio is a handful of synthesised blips.
