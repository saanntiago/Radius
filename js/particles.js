/* ---------------------------------------------------------------------------
   PARTICLES - lightweight effects
   Particles optionally feel the same gravity field as the player, which is a
   nice visual proof that the field is defined everywhere around the planet.
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});
  const Vec2 = Radius.Vec2;
  const TAU = Math.PI * 2;

  class Particles {
    constructor(field) {
      this.field = field;
      this.items = [];
    }

    clear() {
      this.items.length = 0;
    }

    /**
     * @param {object} options
     * @param {Vec2}   options.pos
     * @param {Vec2}   options.vel
     * @param {number} options.life      seconds
     * @param {number} options.size      base radius
     * @param {string} options.color
     * @param {number} options.drag      exponential drag
     * @param {number} options.pull      gravity-field pull factor
     * @param {number} options.shrink    true to shrink while fading
     */
    spawn(options) {
      this.items.push({
        pos: options.pos.clone(),
        vel: options.vel ? options.vel.clone() : Vec2.zero(),
        life: options.life ?? 0.8,
        maxLife: options.life ?? 0.8,
        size: options.size ?? 2,
        color: options.color ?? '#45e6d4',
        drag: options.drag ?? 1.2,
        pull: options.pull ?? 0,
        glow: options.glow ?? 0,
      });
    }

    /** Radial burst, used for jumps, landings and deaths. */
    burst(position, count, options = {}) {
      const speed = options.speed ?? 160;
      const baseAngle = options.angle ?? 0;
      const spread = options.spread ?? TAU;

      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (Math.random() - 0.5) * spread;
        const magnitude = speed * (0.35 + Math.random() * 0.9);
        this.spawn({
          pos: position,
          vel: Vec2.fromPolar(magnitude, angle),
          life: (options.life ?? 0.7) * (0.6 + Math.random() * 0.8),
          size: (options.size ?? 2.4) * (0.5 + Math.random()),
          color: options.color ?? '#45e6d4',
          drag: options.drag ?? 1.6,
          pull: options.pull ?? 0,
          glow: options.glow ?? 8,
        });
      }
    }

    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const p = this.items[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.items.splice(i, 1);
          continue;
        }
        if (p.pull > 0) {
          const gravity = this.field.field(p.pos);
          p.vel = p.vel.add(gravity.scale(p.pull * dt));
        }
        p.vel = p.vel.scale(Math.exp(-p.drag * dt));
        p.pos = p.pos.add(p.vel.scale(dt));
      }
    }

    draw(ctx) {
      ctx.save();
      for (const p of this.items) {
        const t = p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, Math.min(1, t));
        ctx.fillStyle = p.color;
        if (p.glow > 0) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.glow;
        } else {
          ctx.shadowBlur = 0;
        }
        const size = Math.max(0.4, p.size * (0.35 + t * 0.65));
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  Radius.Particles = Particles;
})(window);
