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

**Lift** your finger to shove the ball away from you. For a moment it flies and
turns orange. A lift does nothing to a ball coming the other way, and if you
both lift at once the two shoves cancel out. While your finger is off the glass
your paddle is frozen where you left it — and nothing else about who is holding
matters anywhere in the game. When it is your turn to shove, your lift shoves.

## Reading the field

**Cool is points, red is a life.** Shape says the same thing a second time —
collectables are an **O**, obstacles an **X** — so you never have to pick a
single signal out at speed.

| | |
|---|---|
| **mint** | a collectable that sits still. |
| **blue** | a collectable that moves. |
| **red** | an obstacle. All of them, always — there is one answer and it is "don't". |
| **orange** | a shield, the boosted ball that strips it, and the paddle whose shove is up next. |

Orange is not a family, it is a *state*, and it means the same thing wherever it
turns up: this is what boost is for. Nothing else in the game opens anything.

## The hot end

The paddle the ball last came off turns orange, and the orange bleeds a little
way down the rail before washing back into ink. Only one end is ever hot,
because the ball can only have left one of them, and it swaps the instant the
ball reaches the other paddle.

That is the same orange as everywhere else, doing the same job: **the hot paddle
is the one whose lift boosts right now.** The ball is running away from that
player, so theirs is the shove that lands — and the orange trailing off down the
rail points the way it would go. Whoever is lit is on.

**Spend it and the paddle goes dark.** The moment you lift, the colour leaves
the paddle and moves onto the flare and the ball; it comes back when the shove
runs out and another one is available. So orange on a paddle always means the
same thing: your shove is here, and you have not used it yet.

The rail still says nothing about who is holding. It has no halves and no
opinion about your fingers; the only touch it ever reports is during the launch
ritual, where each paddle shows its own player's hold.

## The ball is the readout

**Colour alone says what the ball is doing** — no ring, no dots, no outline,
just the fill. There are two states, and one of them is "nothing":

| | | |
|---|---|---|
| **orange** | boosting | flying, trailing orange, and strips a shield |
| **ink** | not boosting | strips nothing |

Whether the ball is boosting depends on exactly two things: is a shove running,
and is it pushing the way the ball is already going. Nothing else is consulted —
not whose fingers are down, not the other player's, not anything.

`SHIELD.color` and `ballColorFor('boost')` are the same value, and
`resolveCollectable()` asks `shieldBreaks()` the one question there is, so the
picture and the rule cannot come apart.

## Pieces

**Collectables** are where all of the points are, and none of them can hurt you.
Two are free; the other three wear orange rings and are the only reason to
boost. Each boosted pass strips *ball power* rings, and the pass that takes the
last one banks the piece in the same touch. A plain ball passes straight through
a ring and simply does not count.

| | rings | pays | behaviour |
|---|---|---|---|
| **MOTE** | — | 60 | Sits still and waits. |
| **DRIFTER** | — | 140 | The same mote, wandering. Bounces off the walls and never stops; a stub shows where it came from. |
| **WARD** | 1 | 260 | One boosted pass takes the ring and banks it together. |
| **SHELL** | 2 | 520 | The same piece, one ring deeper. |
| **VAULT** | 3 | 900 | The biggest payout on the field, and the longest to stand still over. |

**Obstacles** are pure hazard. They wear nothing, pay nothing, and cost a life
on *any* contact, boosted or not.

| | pays | behaviour |
|---|---|---|
| **SLAB** | — | A long bar, exactly where it landed. |
| **SHARD** | — | A slab the size of a chip, loose on the field and drifting. |
| **ROTOR** | — | A hub with two sweeping arms; the arms are as lethal as the hub. |

Everything fades in behind a dashed telegraph ring and is inert until it lands.

Because a ring needs a boost, the alternating lift is the basic rhythm of
scoring: you each shove as the ball runs away from you, so the ball is orange in
both directions. The risk is never in touching an obstacle — it is that holding
a line over a three-ring vault takes several passes, and something red is
always on its way.

**Launching.** At the start of a run, and after every lost life, both players
hold their half until the bar fills. A lost ball comes back on the paddle of the
player it was heading toward.

## Runs

Each run is a clock and a score to beat. Clear it and you spend your points on
upgrades — lives, ball power, run time, boost duration — before the next one,
which brings a bigger target and a nastier field. Miss the target
or burn every life and the game is over. Score carries across runs, so the
question is how deep you can get.

Run 1 is `MOTE`s and a `SLAB`: steer the line, dodge the red thing. After that
exactly one new piece arrives per run, alternating sides — something new to
catch, then something new to dodge — so each run teaches one idea and everything
is in play by run 7.

| run | new |
|---|---|
| 2 | `DRIFTER` |
| 3 | `WARD` — the first ring, and the first reason to boost |
| 4 | `SHARD` |
| 5 | `SHELL` |
| 6 | `ROTOR` |
| 7 | `VAULT` |

A ring count never grows with the run — a `WARD` is one ring at run 3 and one
ring at run 30. What escalates is the pieces in play, how many obstacles are on
the field at once, and how fast everything moves.

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

**Steering keeps your side down, and stopping is not a shove** — letting go of a
direction key never boosts the ball. **The shove is a tap of the boost key**,
which also holds your side down without moving it. So you can line a vault up,
stop, and shove only when you mean to.

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
difficulty curve. `src/entities.js` holds the palette and each
piece's own numbers (rings, payout, speed) alongside the blurb the playground
shows. An obstacle's colour is not written down per piece: they are all assigned
`PALETTE.hazard` in a loop, so a new obstacle cannot be given a hue that
disagrees with how it behaves.

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
