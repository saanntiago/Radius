/* ---------------------------------------------------------------------------
   PLAYER - the martian cat
   The character never uses a fixed "down" direction. Every frame the radial
   unit vector u = p / ||p|| defines both:
     * the surface normal (the cat is drawn perpendicular to the surface),
     * the direction opposite to gravity, because F(p) always points to the
       core:   a = F(p) / m   with F from js/field.js.
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});
  const { Vec2 } = Radius;
  const CONFIG = Radius.CONFIG;
  const shortestDelta = Radius.angle.shortestDelta;

  class Player {
    constructor(field, hooks = {}) {
      this.field = field;
      this.hooks = hooks;
      this.radius = CONFIG.player.radius;

      this.pos = new Vec2(0, 0);
      this.prevPos = new Vec2(0, 0);
      this.vel = new Vec2(0, 0);

      this.grounded = false;
      this.ring = null;
      this.walkSpeed = 0;
      this.coyote = 0;

      this.angle = 0;        // polar angle of the position
      this.visualAngle = 0;  // smoothed angle used by the renderer
      this.squash = 1;       // landing squash / jump stretch
      this.dead = false;
      this.trailTimer = 0;
    }

    reset(planet) {
      const radius = planet.spawnRadius + this.radius;
      this.pos = Vec2.fromPolar(radius, planet.spawnAngle);
      this.prevPos.copy(this.pos);
      this.vel = Vec2.zero();
      this.grounded = true;
      this.ring = planet.rings[0];
      this.walkSpeed = 0;
      this.coyote = CONFIG.player.coyoteTime;
      this.angle = planet.spawnAngle;
      this.visualAngle = planet.spawnAngle;
      this.squash = 1;
      this.dead = false;
      this.trailTimer = 0;
    }

    /** Radial unit vector: points away from the core (the cat's "up"). */
    up() {
      return this.pos.norm();
    }

    /** Tangent unit vector: the cat's "right", matching a growing angle. */
    tangent() {
      return this.pos.norm().perp();
    }

    /* -------------------------------------------------------------- update */

    update(dt, input, planet) {
      if (this.dead) return;

      this.prevPos.copy(this.pos);
      this.coyote = Math.max(0, this.coyote - dt);

      if (this.grounded) {
        this.stepGrounded(dt, input);
      } else {
        this.stepAirborne(dt, input);
        if (!this.dead && !this.grounded) this.checkLanding(planet);
      }

      this.updateVisual(dt);
      this.checkHazards(planet);

      if (this.pos.len() > CONFIG.world.outerRadius + 260) this.die('void');
    }

    stepGrounded(dt, input) {
      const P = CONFIG.player;
      const ring = this.ring;
      const radius = ring.radius + this.radius;

      // Tangential walking with acceleration and damping.
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) {
        this.walkSpeed += dir * P.walkAccel * dt;
        this.walkSpeed = Math.max(-P.maxWalkSpeed, Math.min(P.maxWalkSpeed, this.walkSpeed));
      } else {
        this.walkSpeed *= Math.exp(-P.groundDamping * dt);
        if (Math.abs(this.walkSpeed) < 1.5) this.walkSpeed = 0;
      }

      // Rotating rings carry the player: the surface itself has tangential
      // velocity  omega * radius.
      const surfaceSpeed = ring.omega * radius;
      const tangential = this.walkSpeed + surfaceSpeed;
      const theta = this.pos.angle() + (tangential / radius) * dt;

      this.pos = Vec2.fromPolar(radius, theta);
      this.angle = theta;
      this.vel = Vec2.fromPolar(1, theta).perp().scale(tangential);
      this.coyote = CONFIG.player.coyoteTime;

      // Walking over the edge of the arc: there is nothing under the feet.
      if (!ring.isSolidAt(theta)) {
        this.grounded = false;
        this.ring = null;
        this.walkSpeed = tangential;
        return;
      }

      if (input.jump) this.jump(tangential);
    }

    stepAirborne(dt, input) {
      const P = CONFIG.player;
      const u = this.up();
      const tangent = u.perp();
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const tangentialSpeed = this.vel.dot(tangent);

      // ---- vector field gravity:  a = F(p) / m  (m = 1) -------------------
      let acceleration = this.field.field(this.pos);

      // Air control only steers the fall; it never pumps angular momentum
      // beyond the cap below, otherwise a long fall could turn into an orbit
      // and throw the cat out of the planet.
      if (dir !== 0 && Math.abs(tangentialSpeed) < P.maxWalkSpeed) {
        acceleration = acceleration.add(tangent.scale(dir * P.airAccel));
      }

      this.vel = this.vel.add(acceleration.scale(dt));
      this.vel = this.vel.scale(Math.exp(-P.airDrag * dt));

      // Angular-momentum cap: keeps a fall readable and prevents escaping
      // the planet while still allowing the player to dodge in mid air.
      const vt = this.vel.dot(tangent);
      const limited = Math.max(-P.maxAirTangential, Math.min(P.maxAirTangential, vt));
      if (limited !== vt) this.vel = this.vel.addScaled(tangent, limited - vt);

      const speed = this.vel.len();
      if (speed > P.maxSpeed) this.vel = this.vel.scale(P.maxSpeed / speed);

      this.pos = this.pos.add(this.vel.scale(dt));
      this.angle = this.pos.angle();
      this.ring = null;

      // Coyote jump: a few milliseconds of grace after leaving a platform.
      if (input.jump && this.coyote > 0) {
        this.jumpFromAir();
      }
    }

    /* ----------------------------------------------------------- collisions */

    /**
     * One-way platform collision. The rings only stop the player when it
     * crosses their radius from the outside (falling inwards).
     */
    checkLanding(planet) {
      const prevR = this.prevPos.len();
      const currR = this.pos.len();
      if (currR >= prevR) return;

      for (const ring of planet.rings) {
        const footRadius = ring.radius + this.radius;
        if (prevR < footRadius || currR > footRadius) continue;

        const t = (prevR - footRadius) / Math.max(prevR - currR, 1e-6);
        const contact = Vec2.lerp(this.prevPos, this.pos, Math.max(0, Math.min(1, t)));
        const theta = contact.angle();

        if (ring.isSolidAt(theta)) {
          this.land(ring, theta, Math.abs(this.vel.dot(contact.norm())));
          return;
        }
      }
    }

    land(ring, theta, impact) {
      const P = CONFIG.player;
      const radius = ring.radius + this.radius;

      this.pos = Vec2.fromPolar(radius, theta);
      this.angle = theta;
      this.grounded = true;
      this.ring = ring;

      const tangent = this.pos.norm().perp();
      this.walkSpeed = this.vel.dot(tangent);
      this.vel = tangent.scale(this.walkSpeed);
      this.coyote = P.coyoteTime;

      this.squash = 0.62 + Math.min(0.2, impact / 2400);

      if (this.hooks.onLand) this.hooks.onLand(this.pos, impact);
    }

    jump(tangential) {
      const P = CONFIG.player;
      const u = this.pos.norm();
      const tangent = u.perp();

      this.grounded = false;
      this.ring = null;
      this.vel = u.scale(P.jumpSpeed).add(tangent.scale(tangential));
      this.pos = this.pos.add(u.scale(0.6));
      this.coyote = 0;
      this.squash = 1.35;

      if (this.hooks.onJump) this.hooks.onJump(this.pos);
    }

    jumpFromAir() {
      const P = CONFIG.player;
      const u = this.up();
      this.vel = this.vel
        .sub(u.scale(Math.min(0, this.vel.dot(u))))
        .add(u.scale(P.jumpSpeed));
      this.coyote = 0;
      this.squash = 1.3;
      if (this.hooks.onJump) this.hooks.onJump(this.pos);
    }

    checkHazards(planet) {
      const r = this.pos.len();
      const theta = this.pos.angle();

      for (const ring of planet.rings) {
        if (ring.hazards.length === 0) continue;
        if (Math.abs(r - ring.radius) > this.radius + 7) continue;
        if (ring.hazardAt(theta)) {
          this.die('spikes');
          return;
        }
      }
    }

    die(reason) {
      if (this.dead) return;
      this.dead = true;
      this.grounded = false;
      this.ring = null;
      if (this.hooks.onDeath) this.hooks.onDeath(reason);
    }

    /* ---------------------------------------------------------------- visual */

    updateVisual(dt) {
      this.visualAngle += shortestDelta(this.visualAngle, this.angle) * Math.min(1, dt * 20);
      this.squash += (1 - this.squash) * Math.min(1, dt * 11);

      // Speed trail while falling fast.
      const speed = this.vel.len();
      if (!this.grounded && speed > 420 && this.hooks.onTrail) {
        this.trailTimer -= dt;
        if (this.trailTimer <= 0) {
          this.trailTimer = 0.035;
          this.hooks.onTrail(this.pos.clone());
        }
      }
    }
  }

  Radius.Player = Player;
})(window);
