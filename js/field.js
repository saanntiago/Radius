/* ---------------------------------------------------------------------------
   RADIAL GRAVITY FIELD
   ====================
   The gravity of every planet in the game is not a "down" constant: it is a
   vector field defined on the plane (minus the singular core).

       F : R^2 \ {0}  ->  R^2
       F(p) = -g * p / ||p||

   Properties that matter for the course:

     * Every vector points towards the origin (the planet nucleus), so the
       character is always pulled against the surface it stands on, whatever
       its position around the planet.
     * ||F(p)|| = g : the field has constant magnitude. Constant magnitude
       keeps the jump height identical on every ring, which is what makes
       the game playable. A real planet would fall off as 1/r^2; that variant
       is implemented below (`inverseSquare`) and can be compared in the
       math panel, but it is not used for gameplay.
     * F is conservative:  V(p) = g * ||p||  satisfies  F = -grad V.
     * div F = -g / r  (the field converges towards the core).
     * curl F = 0  (irrotational, hence conservative on R^2 \ {0}).
     * Mechanical energy  E = 1/2 m ||v||^2 + V(p)  is conserved in free fall.

   The game integrates a = F(p)/m with m = 1 every fixed step (see
   js/player.js), so the field below is literally the acceleration applied to
   the character.
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});
  const Vec2 = Radius.Vec2;

  class RadialGravityField {
    /**
     * @param {object} options
     * @param {number} options.strength           g, the constant magnitude
     * @param {string} options.profile            'uniform' | 'inverseSquare'
     * @param {number} options.gravitationalMass  GM, only for 'inverseSquare'
     */
    constructor(options = {}) {
      this.strength = options.strength ?? 900;
      this.profile = options.profile ?? 'uniform';
      this.gravitationalMass = options.gravitationalMass ?? 1;
    }

    /* ---------------------------------------------------------------- field */

    /**
     * The field itself: F(p) = -g * p / ||p||.
     * This is the function sampled by the renderer and by the physics.
     */
    field(p) {
      const r = p.len();
      if (r < 1e-6) return Vec2.zero();
      return p.scale(-this.strength / r);
    }

    /** Physical alternative: F(p) = -GM * p / ||p||^3 (inverse-square law). */
    inverseSquare(p) {
      const r = p.len();
      if (r < 1e-6) return Vec2.zero();
      return p.scale(-this.gravitationalMass / (r * r * r));
    }

    /** ||F(p)|| */
    magnitude(p) {
      if (this.profile === 'inverseSquare') {
        const r = p.len();
        return r < 1e-6 ? 0 : this.gravitationalMass / (r * r);
      }
      return p.len() < 1e-6 ? 0 : this.strength;
    }

    /** Scalar potential with F = -grad V. */
    potential(p) {
      if (this.profile === 'inverseSquare') {
        const r = p.len();
        return r < 1e-6 ? 0 : -this.gravitationalMass / r;
      }
      return this.strength * p.len();
    }

    /* ----------------------------------------------------------- divergence */

    /** Analytic divergence, div F = dFx/dx + dFy/dy = -g / r. */
    divergence(p) {
      const r = Math.max(p.len(), 1e-6);
      if (this.profile === 'inverseSquare') return 0;
      return -this.strength / r;
    }

    /** Analytic curl (z component), curl F = dFy/dx - dFx/dy = 0. */
    curl() {
      return 0;
    }

    /* -------------------------------------------------- numeric derivatives */

    /**
     * Central-difference divergence. Used by the math panel to show that the
     * analytic result and the numerical one agree.
     */
    numericalDivergence(p, h = 0.5) {
      const fxp = this.field(new Vec2(p.x + h, p.y));
      const fxm = this.field(new Vec2(p.x - h, p.y));
      const fyp = this.field(new Vec2(p.x, p.y + h));
      const fym = this.field(new Vec2(p.x, p.y - h));
      return (fxp.x - fxm.x) / (2 * h) + (fyp.y - fym.y) / (2 * h);
    }

    /** Central-difference curl (z component). */
    numericalCurl(p, h = 0.5) {
      const fxp = this.field(new Vec2(p.x + h, p.y));
      const fxm = this.field(new Vec2(p.x - h, p.y));
      const fyp = this.field(new Vec2(p.x, p.y + h));
      const fym = this.field(new Vec2(p.x, p.y - h));
      return (fxp.y - fxm.y) / (2 * h) - (fyp.x - fym.x) / (2 * h);
    }

    /* ------------------------------------------------------------- sampling */

    /**
     * Samples the field on a polar grid. Used by the vector-field overlay.
     * Returns vectors in world space plus their polar coordinates.
     */
    samplePolar(radii, spokes, phase = 0) {
      const samples = [];
      for (let ri = 0; ri < radii.length; ri++) {
        for (let si = 0; si < spokes; si++) {
          const angle = phase + (si / spokes) * Math.PI * 2;
          const point = Vec2.fromPolar(radii[ri], angle);
          samples.push({ point, angle, radius: radii[ri], vector: this.field(point) });
        }
      }
      return samples;
    }

    /**
     * A field line of a radial field is a straight segment: every point of
     * the line is pulled towards the core. The overlay animates dashes along
     * these lines to show the direction of the flow.
     */
    fieldLine(angle, innerRadius, outerRadius) {
      return {
        start: Vec2.fromPolar(outerRadius, angle),
        end: Vec2.fromPolar(innerRadius, angle),
        angle,
      };
    }
  }

  Radius.RadialGravityField = RadialGravityField;
})(window);
