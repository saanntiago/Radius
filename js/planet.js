/* ---------------------------------------------------------------------------
   PLANET - rings, gaps, hazards and procedural generation
   A planet is a set of concentric rings (arcs) around the core. The player
   starts on the outermost ring and has to descend ring by ring until the
   core is reached. Every ring is a circle with angular gaps; the player
   falls through a gap and lands on the next ring below.
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});
  const Vec2 = Radius.Vec2;
  const TAU = Math.PI * 2;

  /* ------------------------------------------------------------ level data */

  /**
   * Five planets of increasing complexity.
   *  - rings:        how many floors the player has to descend
   *  - gapsPerRing:  holes per ring
   *  - gapWidth:     angular width of every hole (radians)
   *  - hazards:      target number of spike arcs
   *  - rotors:       indices of rings that rotate
   *  - rotorSpeed:   angular speed of the rotating rings (rad/s)
   */
  const LEVELS = [
    {
      id: 1,
      name: 'Órbita Exterior',
      rings: 3,
      gapsPerRing: 2,
      gapWidth: 0.52,
      hazards: 0,
      rotors: [],
      rotorSpeed: 0,
    },
    {
      id: 2,
      name: 'Anillos Quebrados',
      rings: 4,
      gapsPerRing: 2,
      gapWidth: 0.46,
      hazards: 2,
      rotors: [],
      rotorSpeed: 0,
    },
    {
      id: 3,
      name: 'Deriva Angular',
      rings: 5,
      gapsPerRing: 2,
      gapWidth: 0.42,
      hazards: 4,
      rotors: [2],
      rotorSpeed: 0.45,
    },
    {
      id: 4,
      name: 'Campo Inestable',
      rings: 6,
      gapsPerRing: 3,
      gapWidth: 0.36,
      hazards: 4,
      rotors: [1, 4],
      rotorSpeed: 0.62,
    },
    {
      id: 5,
      name: 'Singularidad',
      rings: 7,
      gapsPerRing: 3,
      gapWidth: 0.32,
      hazards: 6,
      rotors: [2, 5],
      rotorSpeed: 0.85,
    },
  ];

  /* -------------------------------------------------------- angular helpers */

  function normalizeAngle(a) {
    a %= TAU;
    return a < 0 ? a + TAU : a;
  }

  /** Shortest absolute distance between two angles, in [0, PI]. */
  function angleDistance(a, b) {
    const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    return Math.min(d, TAU - d);
  }

  /** Is `angle` inside the arc [start, start + sweep]? */
  function arcContains(angle, start, sweep) {
    if (sweep >= TAU - 1e-9) return true;
    return normalizeAngle(angle - start) <= sweep;
  }

  /** Do two arcs share at least one angle? */
  function arcsIntersect(a1, s1, a2, s2) {
    if (s1 >= TAU - 1e-9 || s2 >= TAU - 1e-9) return true;
    return (
      arcContains(a1, a2, s2) ||
      arcContains(a1 + s1, a2, s2) ||
      arcContains(a2, a1, s1) ||
      arcContains(a2 + s2, a1, s1)
    );
  }

  /** Deterministic PRNG so a seed always rebuilds the same planet. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ Ring */

  class Ring {
    /**
     * @param {object} options
     * @param {number} options.radius    distance from the core
     * @param {Array}  options.gaps      [{ center, width }] in local angles
     * @param {Array}  options.hazards   [{ center, width }] in local angles
     * @param {number} options.omega     angular speed (rad/s), 0 = static
     * @param {number} options.index     position from the outside (0 = outer)
     */
    constructor(options) {
      this.radius = options.radius;
      this.gaps = options.gaps || [];
      this.hazards = options.hazards || [];
      this.omega = options.omega || 0;
      this.index = options.index || 0;
      this.angle = 0;
    }

    update(dt) {
      if (this.omega !== 0) this.angle = normalizeAngle(this.angle + this.omega * dt);
    }

    /** Is there a platform under this world-space angle? */
    isSolidAt(worldAngle) {
      const local = normalizeAngle(worldAngle - this.angle);
      for (const gap of this.gaps) {
        if (arcContains(local, gap.center - gap.width / 2, gap.width)) return false;
      }
      return true;
    }

    /** Is there a spike arc under this world-space angle? */
    hazardAt(worldAngle) {
      const local = normalizeAngle(worldAngle - this.angle);
      for (const hazard of this.hazards) {
        if (arcContains(local, hazard.center - hazard.width / 2, hazard.width)) return true;
      }
      return false;
    }

    /** Solid arcs, ready to be stroked by the renderer. */
    solidSegments() {
      const gaps = this.gaps.slice().sort((a, b) => a.center - b.center);
      if (gaps.length === 0) return [{ start: 0, sweep: TAU }];

      const segments = [];
      for (let i = 0; i < gaps.length; i++) {
        const current = gaps[i];
        const next = gaps[(i + 1) % gaps.length];
        const start = normalizeAngle(current.center + current.width / 2);
        const end = normalizeAngle(next.center - next.width / 2);
        let sweep = normalizeAngle(end - start);
        if (sweep < 1e-6) sweep = TAU;
        segments.push({ start, sweep });
      }
      return segments;
    }

    /** Hazard arcs, ready to be stroked by the renderer. */
    hazardSegments() {
      return this.hazards.map((h) => ({
        start: normalizeAngle(h.center - h.width / 2),
        sweep: h.width,
      }));
    }
  }

  /* ---------------------------------------------------------------- Planet */

  class Planet {
    constructor(options) {
      this.levelIndex = options.levelIndex;
      this.seed = options.seed;
      this.config = options.config;
      this.coreRadius = options.coreRadius;
      this.outerRadius = options.outerRadius;
      this.rings = options.rings;
      this.spawnAngle = options.spawnAngle;
    }

    update(dt) {
      for (const ring of this.rings) ring.update(dt);
    }

    get spawnRadius() {
      return this.rings[0].radius;
    }

    resetRotation() {
      for (const ring of this.rings) ring.angle = 0;
    }
  }

  /* ------------------------------------------------------------ generation */

  const SPAWN_ANGLE = -Math.PI / 2; // top of the screen

  function ringRadii(count, outer, inner) {
    const radii = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      radii.push(outer + (inner - outer) * t);
    }
    return radii;
  }

  /**
   * Picks the holes of a ring. A hole is rejected when:
   *  - it is too close to another hole of the same ring,
   *  - it sits under a hole of the ring above (the player would fall
   *    straight through instead of landing),
   *  - it is under the spawn point on the outermost ring.
   */
  function placeGaps(rand, index, previousGaps, config) {
    const gaps = [];
    const width = config.gapWidth;
    const spacing = width + 0.55;
    let attempts = 0;

    while (gaps.length < config.gapsPerRing && attempts < 600) {
      attempts++;
      const center = rand() * TAU;

      if (gaps.some((g) => angleDistance(g.center, center) < spacing)) continue;

      const blocksLanding = previousGaps.some(
        (g) => angleDistance(g.center, center) < (g.width + width) / 2 + 0.32
      );
      if (blocksLanding) continue;

      if (index === 0 && angleDistance(center, SPAWN_ANGLE) < width / 2 + 0.55) continue;

      gaps.push({ center, width });
    }

    // Always leave at least one way down.
    if (gaps.length === 0) {
      gaps.push({ center: SPAWN_ANGLE + Math.PI * 0.6, width });
    }
    return gaps;
  }

  /**
   * Spike arcs. Rules that keep the level fair:
   *  - only on static rings (a rotating spike ring would sweep the player),
   *  - never right under a hole of the ring above (you would land on them
   *    with no chance to react),
   *  - at most one per solid segment, so both sides of the segment always
   *    keep access to a gap.
   */
  function placeHazards(ring, ringAbove, budget, index) {
    if (budget <= 0 || ring.omega !== 0) return 0;
    if (ringAbove && ringAbove.omega !== 0) return 0;

    let placed = 0;
    const segments = ring.solidSegments().sort((a, b) => b.sweep - a.sweep);

    for (const segment of segments) {
      if (placed >= budget) break;

      const width = Math.min(0.2, segment.sweep * 0.22);
      if (segment.sweep < width + 0.9) continue;

      const margin = 0.16;
      const from = segment.start + width / 2 + margin;
      const to = segment.start + segment.sweep - width / 2 - margin;
      let chosen = null;

      // Walk from the middle of the solid segment outwards and pick the
      // first spot that is not a landing zone of the ring above.
      for (let k = 0; k < 14 && chosen === null; k++) {
        const offset = Math.ceil(k / 2) / 14;
        const t = k % 2 === 1 ? 0.5 + offset : 0.5 - offset;
        const center = normalizeAngle(from + (to - from) * Math.min(1, Math.max(0, t)));

        if (index === 0 && angleDistance(center, SPAWN_ANGLE) < 0.8) continue;

        const overlapsHoleAbove = (ringAbove ? ringAbove.gaps : []).some((gap) =>
          arcsIntersect(
            center - width / 2,
            width,
            gap.center - gap.width / 2 - 0.28,
            gap.width + 0.56
          )
        );
        if (overlapsHoleAbove) continue;

        chosen = center;
      }

      if (chosen === null) continue;

      ring.hazards.push({ center: chosen, width });
      placed++;
    }

    return placed;
  }

  function createPlanet(levelIndex, seed) {
    const config = LEVELS[levelIndex];
    const rand = mulberry32(seed);
    const radii = ringRadii(
      config.rings,
      Radius.CONFIG.world.outerRadius,
      Radius.CONFIG.world.innerRadius
    );

    const rings = [];
    let previousGaps = [];
    let hazardBudget = config.hazards;

    for (let i = 0; i < config.rings; i++) {
      const gaps = placeGaps(rand, i, previousGaps, config);
      const isRotor = config.rotors.includes(i);

      const ring = new Ring({
        radius: radii[i],
        gaps,
        hazards: [],
        omega: isRotor ? config.rotorSpeed * (i % 2 === 0 ? 1 : -1) : 0,
        index: i,
      });

      rings.push(ring);
      previousGaps = gaps;
    }

    // Hazards are placed after every ring exists, so a ring can look at the
    // holes of the ring above it.
    for (let i = 0; i < rings.length && hazardBudget > 0; i++) {
      const ringAbove = i > 0 ? rings[i - 1] : null;
      hazardBudget -= placeHazards(rings[i], ringAbove, hazardBudget, i);
    }

    return new Planet({
      levelIndex,
      seed,
      config,
      coreRadius: Radius.CONFIG.world.coreRadius,
      outerRadius: Radius.CONFIG.world.outerRadius,
      rings,
      spawnAngle: SPAWN_ANGLE,
    });
  }

  /* -------------------------------------------------------------- exports */

  Radius.LEVELS = LEVELS;
  Radius.Ring = Ring;
  Radius.Planet = Planet;
  Radius.createPlanet = createPlanet;
  Radius.angle = {
    TAU,
    normalize: normalizeAngle,
    distance: angleDistance,
    contains: arcContains,
    intersect: arcsIntersect,
    shortestDelta(from, to) {
      return ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
    },
  };
})(window);
