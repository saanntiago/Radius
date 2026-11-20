# Radius

**Radius** is a browser platformer built for a Vector Calculus final project.
Each level is a hollow planet and the player — a martian cat — starts on the
outermost ring and has to descend ring by ring until reaching the glowing core,
which unlocks the next planet.

The twist: there is no fixed "down". Gravity is a **vector field** whose vectors
always point to the centre of the planet, so the character sticks to any ring
(in any orientation) and is always drawn perpendicular to the surface.

Play it by opening `index.html` in any modern browser. No build step, no
dependencies, no installation.

```
git clone <repo>
cd Radius
# option 1: double click index.html
# option 2: run a local server
python -m http.server 8000
# then open http://localhost:8000
```

---

## Controls

| Key | Action |
| --- | --- |
| `A` / `←` | walk counter-clockwise around the ring (the cat's left) |
| `D` / `→` | walk clockwise around the ring (the cat's right) |
| `Space` / `W` / `↑` | jump away from the core |
| `F` | toggle the vector-field overlay |
| `M` | toggle the live math panel |
| `R` | restart the current planet (same seed) |
| `P` / `Esc` | pause |
| `Enter` | confirm / continue |

Touch buttons appear automatically on touch devices.

---

## The gravity field

The gravity used by the simulation is the planar vector field

```
F : R² \ {0} → R²
F(p) = −g · p / ‖p‖
```

with `g = 900` world units/s² (`js/config.js`). In components, with
`r = √(x² + y²)`:

```
F(x, y) = ( −g·x/r , −g·y/r )
```

Properties, all shown live in the in-game panel (`M`):

| Quantity | Value | Meaning |
| --- | --- | --- |
| `‖F(p)‖` | `g` | uniform magnitude, so jumps feel identical on every ring |
| `∇·F` | `−g/r` | the field converges towards the core |
| `∇×F` | `0` | irrotational ⇒ conservative |
| `V(x,y)` | `g·r` | potential, with `F = −∇V` |
| `E` | `½m‖v‖² + V(p)` | conserved during free fall (`m = 1`) |

The panel evaluates `F(p)`, its magnitude, the potential and the mechanical
energy at the player position, and compares the analytic divergence/curl with
central-difference approximations computed numerically in `js/field.js`.

### Why a constant magnitude?

A real planet follows the inverse-square law `F = −GM·p/‖p‖³`, but gravity would
then grow as `1/r²` while the player descends, making the inner rings
unplayable. The direction of the field is what the project is about, so the
magnitude is kept constant and the physically correct variant is still
implemented (`RadialGravityField.inverseSquare`) for comparison. Switching the
profile in `js/config.js` / `js/field.js` is a one-line change.

### How the field drives the character

Every fixed step (`1/120 s`) the player integrates

```
a = F(p)/m        (m = 1)
v ← v + a·dt
p ← p + v·dt
```

The field also defines the character's local frame. With
`u = p/‖p‖ = −F(p)/‖F(p)‖`:

* `u` is the surface normal and the cat's "up";
* `t = perp(u)` is the tangent used for walking;
* the sprite is rotated by `θ + π/2`, so it is always perpendicular to the ring.

Platforms are one-way: the player only lands when it crosses a ring radius from
the outside. Walking over an arc end (a gap) leaves the player in free fall,
which is when the vector field takes over.

Air control only steers the fall. A hard cap on the tangential component of the
velocity (`maxAirTangential`) prevents a long fall from turning into an orbit
that escapes the planet.

---

## Levels

| # | Name | Rings | Hazard arcs | Rotating rings | Rotation speed |
| --- | --- | --- | --- | --- | --- |
| 1 | Órbita Exterior | 3 | 0 | – | – |
| 2 | Anillos Quebrados | 4 | 2 | – | – |
| 3 | Deriva Angular | 5 | 4 | 1 | 0.45 rad/s |
| 4 | Campo Inestable | 6 | 4 | 2 | 0.62 rad/s |
| 5 | Singularidad | 7 | 6 | 2 | 0.85 rad/s |

Planets are generated procedurally from a seed (`js/planet.js`) and the seed is
shown in the HUD, so restarting keeps the same planet. The generator guarantees
that:

* every ring has at least one gap (there is always a way down);
* the spawn point of the outermost ring is solid and spike-free;
* a ring is solid under the gaps of the ring above, so falls always land;
* spikes never sit directly under a static gap, and never on (or directly below)
  a rotating ring, where a moving gap could drop the player onto them;
* there is at most one spike arc per solid segment, so both sides of a segment
  always keep access to a gap.

Rotating rings carry the player along: the surface itself has tangential
velocity `ω·r`.

---

## Project structure

```
index.html            markup, HUD, overlays and the math panel
styles.css            space theme
js/config.js          tunable constants (g, radii, player physics)
js/vec2.js            minimal 2D vector type
js/field.js           the radial gravity vector field + derivatives
js/planet.js          rings, gaps, hazards and procedural generation
js/player.js          physics: a = F(p)/m, walking, landing, jumps
js/particles.js       effects (the particles also feel the field)
js/renderer.js        canvas rendering, sprite and field overlay
js/game.js            state machine, input, HUD, fixed-step loop
js/main.js            entry point
```

The code is written with plain scripts (no modules) so the game also works when
`index.html` is opened directly from the file system.

---

## Resumen (para la exposición)

Cada nivel es un planeta hueco. La gravedad no es una constante "hacia abajo":
es un campo vectorial radial `F(p) = −g·p/‖p‖` que apunta siempre al núcleo.
El jugador integra `a = F(p)/m` en cada paso, por lo que se mantiene pegado a la
superficie en cualquier orientación y cae cuando no hay plataforma bajo sus pies.
La tecla `F` dibuja las líneas del campo (con flechas y guiones animados hacia el
centro) y la tecla `M` muestra en vivo `F(p)`, `‖F‖`, `∇·F`, `∇×F`, el potencial
`V = g·r` y la energía mecánica del jugador. Como `∇×F = 0`, el campo es
conservador y la energía se conserva en caída libre. El proyecto también
implementa la variante física `F = −GM·p/‖p‖³` para comparar, aunque el juego usa
magnitud constante para que los saltos sean consistentes en todos los anillos.
