/* ---------------------------------------------------------------------------
   RADIUS - central configuration
   Every value is expressed in world units (pixels) and seconds, so the
   physics constants can be read like the equations in the math panel.
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});

  Radius.CONFIG = {
    world: {
      viewRadius: 452,      // half of the visible square, in world units
      outerRadius: 380,     // radius of the outermost ring of every planet
      innerRadius: 96,      // radius of the innermost ring
      coreRadius: 34,       // the goal: the planet nucleus
      ringThickness: 8,
    },

    /**
     * g = ||F(p)|| : constant magnitude of the radial gravity field.
     * See js/field.js for the field definition.
     */
    gravity: {
      strength: 900,
    },

    player: {
      radius: 10,           // collision radius
      walkAccel: 2400,      // tangential acceleration while standing
      maxWalkSpeed: 240,    // tangential speed cap while standing
      groundDamping: 9,     // exponential damping when there is no input
      airAccel: 950,        // tangential steering while falling
      maxAirTangential: 330,// hard cap for angular momentum while falling
      jumpSpeed: 350,       // impulse along +normal (away from the core)
      maxSpeed: 1300,
      airDrag: 0.25,
      coyoteTime: 0.08,     // grace period to jump after leaving a platform
    },

    loop: {
      fixedStep: 1 / 120,   // deterministic integration step
      maxFrame: 0.05,
    },
  };
})(window);
