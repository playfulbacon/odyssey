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

## Two resources, one source

**Gold buys upgrades; points clear stages**, and neither does the other's job.
Points are not spent, not carried forward and not totalled — a run's points
matter only against that run's target, and the moment it is met they stop
mattering at all.

Both come out of the same act: **killing an enemy**. Nothing else on the field
pays anything. But they arrive on different clocks, and that is the whole of the
loop:

- The **points** land the instant it dies, and can never be taken away.
- The **gold** is thrown onto the floor where it stood, as a scatter of motes
  that **fade if nobody comes for them**. Nothing else ever puts gold on the
  field.

So a kill is only half paid until somebody steers the line back across the
wreckage. Killing wins you the run; sweeping pays for the next one.

Clearing early pays a **gold** bonus rather than bonus points, for the same
reason: points you have already won the run with are worth nothing, and the only
reward worth handing out is one you can spend. The record kept between games is
*how deep you got*, not a score.

## Reading the field

| | |
|---|---|
| **gold** | loot from a kill. Never dangerous, and it fades. |
| **pink** | an enemy. Beatable, if your number is big enough. |
| **red** | an obstacle. Not beatable at any number. |
| **orange** | boost — the shoving ball, a weak point, and the paddle whose shove is up next. |
| **steel** | shield plating. Inert: it cannot hurt you and you cannot hurt it. |

Shape says it a second time: gold is an **O**, obstacles are an **X**, and an
enemy wears its strength as a **numeral** — the one glyph you actually have to
read, because the whole enemy interaction is comparing it against the ball's.

## The hot end

The paddle the ball last came off turns orange, and the orange bleeds a little
way down the rail before washing back into ink. Only one end is ever hot,
because the ball can only have left one of them, and it swaps the instant the
ball reaches the other paddle.

That is the same orange as everywhere else, doing the same job: **the hot paddle
is the one whose lift boosts right now.** The ball is running away from that
player, so theirs is the shove that lands. **Spend it and the paddle goes dark**
— the colour moves onto the flare and the ball, and comes back when the shove
runs out.

## Strength

**The ball has a strength and so does every enemy, and both numbers are written
on them.** A contact between the two is settled by one comparison:

| | |
|---|---|
| ball **equal or greater** | the enemy dies and pays |
| ball **weaker** | the ball takes the damage and is thrown back |

**A shove adds 1**, which is why the number on the ball goes up the moment it
turns orange: a resting ball is **1**, a boosted one is **2**. `BOOST STRENGTH`
raises what the shove adds, and everything on the field gains strength as the
runs go by — so it is not a luxury, it is how you keep up.

Both halves of that lesson are on the field from run 1. A `DRONE` is strength 1
and dies to a resting ball. A `BRUTE` is strength 2 and simply will not, no
matter how well you aim: it has no shield and no trick to it, it just has to be
shoved.

## Shields and weak points

Some enemies wear a steel ring with **one or two orange weak points** cut into
it. The plating is inert — bounce off it all day and nothing happens to either
of you. The weak point is the only way in and it takes a **boosted** ball.

**A weak point faces one end of the phone, and the ball can only enter through
it while running away from that end.** That is the co-op knot: on a `CYCLOPS`,
one shield with one weak point, only one of you can be the one to shove, and it
is whoever it is facing. The other player steers and keeps still. A `JANUS` has
a weak point facing each of you, so either can take the shot — and it is
stronger to make up for it.

**The ball reverses when it hits a shield**, plating and weak point alike.
Arriving at the right hole from the wrong side is just a wall.

## Pieces

**Enemies** — the only things that pay anything, and the only things that can be
beaten. Every one drops its gold on the floor when it dies.

| | strength | points | drops | opening |
|---|---|---|---|---|
| **DRONE** | 1 | 200 | 1 mote | none. A resting ball is already enough. |
| **BRUTE** | 2 | 380 | 2 motes | none, but a resting ball is one short — it has to be shoved. |
| **CYCLOPS** | 2 | 600 | 3 motes | one weak point. One player's job. |
| **JANUS** | 3 | 1000 | 5 motes | one weak point facing each of you. |

**Gold** — a `GOLD MOTE` is worth 15, and nothing ever spawns one. They exist
only as loot, and they fade.

**Obstacles** — red, worth nothing, no strength to beat. Touching one costs
health and throws the ball back, every time.

| | |
|---|---|
| **SLAB** | A long bar, exactly where it landed. |
| **SHARD** | A slab the size of a chip, loose on the field and drifting. |
| **ROTOR** | A hub with two sweeping arms, as lethal as the hub. |

Everything fades in behind a dashed telegraph ring and is inert until it lands.

## Health and lives

Two separate things. **Health** is the ball's, and comes off one point at a time
whenever it hits an obstacle or loses a fight. **Lives** are how many balls you
have left. When health runs out you lose a life, everything stops, and you both
hold again to launch a fresh ball at full health.

## Runs

Each run is a clock and a number of **points** to reach. Clear it and spend your
**gold** — boost strength, ball health, extra lives, extra time — before the
next one. Miss the target or burn every life and the game is over.

Run 1 opens with both halves of the strength lesson — a `DRONE` you can take at
rest and a `BRUTE` you cannot — plus a `SLAB` to steer around. After that it is
one new piece per run, alternating between something to fight and something to
get past.

| run | new |
|---|---|
| 2 | `SHARD` |
| 3 | `CYCLOPS` — the first weak point |
| 4 | `ROTOR` |
| 5 | `JANUS` |

Everything on the field also gains strength as the runs go by, which is the one
thing that never stops escalating.

## Playground

A no-clock, no-target, endless-lives sandbox with one page per piece, so a
mechanic can be learned in isolation. Gold turns up on the enemy pages the same
way it does anywhere else — by falling out of something you killed. The sandbox
hands you enough boost strength to beat the strongest enemy in the game — at base stats a
`JANUS` is deliberately out of reach, and a page you cannot beat teaches
nothing.

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
which also holds your side down without moving it. So you can line a cyclops up,
stop, and shove from the correct end only when you mean to.

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

`src/config.js` is the whole dial board — ball pace, boost duration, base
strength and health, launch hold time, run targets, upgrade prices, and the
per-run difficulty curve. `src/entities.js` holds the palette, the weak-point
geometry and each piece's own numbers alongside the blurb the playground shows.

Two things are derived rather than written down, so the picture cannot disagree
with the rules: an enemy's shield plating comes out of `shieldSpans()`, the same
table `weakPointAt()` reads, and every piece's colour comes from its family.

**`maxEnemies` is both curves at once.** Enemies are the only source of points
*and* the only source of gold, so how many are on the field decides whether the
target is reachable and whether the shop is affordable. If either starts feeling
wrong, that is the dial before `CFG.run.target` or the upgrade prices.

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
- **Balance is a first pass.** Headless play clears runs 1-3 comfortably and
  stalls around run 4, when the CYCLOPS arrives and everything gains a point of
  strength — but that was a bot that buys upgrades badly, not a verdict. The
  levers, in the order worth reaching for: `maxEnemies` (which *is* the score
  curve, since points come only from kills), `CFG.run.target`, and
  `strengthBonus`.
- A CYCLOPS asks one specific player to make the shove, which is the best idea
  in the build and also the least tested with two real humans. The weak-point
  arc (`WEAK_HALF`) is the dial if it turns out to be too fussy to hit.
- No haptics, and audio is a handful of synthesised blips.
