/* ---------------------------------------------------------------------------
   RENDERER - canvas painting
   Everything is drawn around the planet core at world (0, 0). The world is a
   square of side 2 * viewRadius scaled to fit the viewport, so the planet is
   always fully visible and the game works on any screen.
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});
  const { Vec2 } = Radius;
  const CONFIG = Radius.CONFIG;
  const TAU = Math.PI * 2;

  const COLORS = {
    ring: '#3fe0cf',
    ringGlow: 'rgba(63, 224, 207, 0.75)',
    rotor: '#7fe9ff',
    rotorGlow: 'rgba(127, 233, 255, 0.8)',
    hazard: '#ff4d5e',
    hazardGlow: 'rgba(255, 77, 94, 0.85)',
    field: 'rgba(88, 214, 255, 0.55)',
    core: '#ff8a3d',
  };

  function polar(radius, angle) {
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  }

  class Renderer {
    constructor(canvas, field) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.field = field;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.scale = 1;
      this.stars = [];
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';

      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.scale = Math.min(width, height) / (2 * CONFIG.world.viewRadius);

      this.buildStars();
    }

    buildStars() {
      this.stars = [];
      const count = 220;
      for (let i = 0; i < count; i++) {
        this.stars.push({
          x: Math.random(),
          y: Math.random(),
          size: 0.4 + Math.random() * 1.7,
          phase: Math.random() * TAU,
          speed: 0.4 + Math.random() * 1.6,
          tint: Math.random() < 0.18 ? '#a8e8ff' : Math.random() < 0.3 ? '#ffd9a8' : '#ffffff',
        });
      }
    }

    /* --------------------------------------------------------------- frame */

    render(state) {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.drawBackground(state.time);
      this.drawFlash(state.flash);

      const shake = state.shake || 0;
      const sx = (Math.random() - 0.5) * shake;
      const sy = (Math.random() - 0.5) * shake;

      ctx.save();
      ctx.setTransform(
        this.scale * this.dpr, 0, 0, this.scale * this.dpr,
        (this.width / 2 + sx) * this.dpr,
        (this.height / 2 + sy) * this.dpr
      );

      this.drawPlanetDisc(state.planet);
      if (state.fieldVisible) this.drawVectorField(state.time);
      this.drawRings(state.planet);
      this.drawHazards(state.planet, state.time);
      this.drawCore(state.planet, state.time);
      state.particles.draw(ctx);
      if (!state.player.dead) this.drawCat(state.player, state.time);

      ctx.restore();
    }

    /* ---------------------------------------------------------- background */

    drawBackground(time) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const w = this.width;
      const h = this.height;

      const sky = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      sky.addColorStop(0, '#062033');
      sky.addColorStop(0.45, '#04121f');
      sky.addColorStop(1, '#010509');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Two soft nebulae for depth.
      this.drawNebula(w * 0.22, h * 0.28, w * 0.34, 'rgba(30, 130, 160, 0.10)');
      this.drawNebula(w * 0.82, h * 0.74, w * 0.3, 'rgba(90, 60, 150, 0.10)');

      for (const star of this.stars) {
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * star.speed + star.phase));
        ctx.globalAlpha = twinkle * 0.9;
        ctx.fillStyle = star.tint;
        const x = ((star.x * w) + time * 2) % w;
        const y = star.y * h;
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, TAU);
        ctx.fill();
        if (star.size > 1.6) {
          ctx.globalAlpha = twinkle * 0.18;
          ctx.beginPath();
          ctx.arc(x, y, star.size * 3.4, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Vignette.
      const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    }

    drawNebula(x, y, radius, color) {
      const ctx = this.ctx;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    drawFlash(flash) {
      if (!flash || flash <= 0) return;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = `rgba(255, 70, 90, ${Math.min(0.45, flash)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    /* -------------------------------------------------------------- planet */

    drawPlanetDisc(planet) {
      const ctx = this.ctx;
      const outer = planet.outerRadius + 26;

      const disc = ctx.createRadialGradient(0, 0, planet.coreRadius * 0.4, 0, 0, outer);
      disc.addColorStop(0, 'rgba(9, 40, 58, 0.55)');
      disc.addColorStop(0.35, 'rgba(7, 32, 48, 0.85)');
      disc.addColorStop(0.9, 'rgba(5, 22, 34, 0.92)');
      disc.addColorStop(1, 'rgba(4, 16, 26, 0)');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(0, 0, outer, 0, TAU);
      ctx.fill();

      // Atmosphere rim.
      const rim = ctx.createRadialGradient(0, 0, outer * 0.86, 0, 0, outer * 1.16);
      rim.addColorStop(0, 'rgba(69, 230, 212, 0)');
      rim.addColorStop(0.55, 'rgba(69, 230, 212, 0.10)');
      rim.addColorStop(1, 'rgba(69, 230, 212, 0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(0, 0, outer * 1.16, 0, TAU);
      ctx.fill();
    }

    /* ------------------------------------------------------- vector field -- */

    /**
     * Overlay of the gravity field. For a radial field every field line is a
     * straight segment from the outer radius to the core; animated dashes
     * travel along the lines towards the centre and small arrow heads make
     * the direction explicit.
     */
    drawVectorField(time) {
      const ctx = this.ctx;
      const outer = CONFIG.world.outerRadius - 4;
      const inner = CONFIG.world.coreRadius + 16;
      const spokes = 42;
      const phase = time * 0.1;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // 1. Field lines (streamlines of the field).
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.setLineDash([8, 16]);
      ctx.lineDashOffset = -time * 70;
      ctx.strokeStyle = 'rgba(96, 222, 255, 0.26)';

      for (let i = 0; i < spokes; i++) {
        const angle = phase + (i / spokes) * TAU;
        const start = polar(outer, angle);
        const end = polar(inner, angle);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // 2. Vector arrows on a polar grid: F(p) sampled at each point.
      const radii = [outer * 0.92, outer * 0.72, outer * 0.52, outer * 0.34];
      const samples = this.field.samplePolar(radii, 26, phase);

      for (const sample of samples) {
        const vector = sample.vector.norm();
        const length = 17;
        const tip = sample.point.add(vector.scale(length));
        const alpha = 0.22 + 0.3 * (1 - sample.radius / outer);

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#7fe9ff';
        ctx.fillStyle = '#7fe9ff';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(sample.point.x, sample.point.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();

        // Arrow head, oriented along the field vector (towards the core).
        const back = vector.scale(-4.2);
        const side = vector.perp().scale(2.6);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x + back.x + side.x, tip.y + back.y + side.y);
        ctx.lineTo(tip.x + back.x - side.x, tip.y + back.y - side.y);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* --------------------------------------------------------------- rings */

    drawRings(planet) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = 'round';

      for (const ring of planet.rings) {
        const rotor = ring.omega !== 0;
        for (const segment of ring.solidSegments()) {
          const start = segment.start + ring.angle;
          const end = start + segment.sweep;

          ctx.shadowColor = rotor ? COLORS.rotorGlow : COLORS.ringGlow;
          ctx.shadowBlur = rotor ? 18 : 12;
          ctx.strokeStyle = rotor ? COLORS.rotor : COLORS.ring;
          ctx.lineWidth = CONFIG.world.ringThickness;

          ctx.beginPath();
          ctx.arc(0, 0, ring.radius, start, end);
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.lineWidth = 2;
        for (const segment of ring.solidSegments()) {
          ctx.beginPath();
          ctx.arc(0, 0, ring.radius - 2.5, segment.start + ring.angle, segment.start + segment.sweep + ring.angle);
          ctx.stroke();
        }

        // Small rotating ticks on rotor rings.
        if (rotor) {
          ctx.fillStyle = 'rgba(127, 233, 255, 0.9)';
          for (let i = 0; i < 3; i++) {
            const a = ring.angle * 2 + (i / 3) * TAU;
            const point = polar(ring.radius, a);
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1.6, 0, TAU);
            ctx.fill();
          }
        }
      }

      ctx.restore();
    }

    /* ------------------------------------------------------------- hazards */

    drawHazards(planet, time) {
      const ctx = this.ctx;
      ctx.save();
      ctx.shadowColor = COLORS.hazardGlow;
      ctx.shadowBlur = 14;
      ctx.fillStyle = COLORS.hazard;

      for (const ring of planet.rings) {
        for (const hazard of ring.hazardSegments()) {
          const start = hazard.start + ring.angle;
          const end = start + hazard.sweep;
          const step = 0.048;
          const baseRadius = ring.radius + 1;

          // Base line.
          ctx.strokeStyle = 'rgba(255, 77, 94, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, baseRadius, start, end);
          ctx.stroke();

          // Spikes pointing away from the core.
          for (let a = start; a < end - 1e-3; a += step) {
            const a2 = Math.min(a + step * 0.82, end);
            const p1 = polar(baseRadius, a);
            const p2 = polar(baseRadius, a2);
            const mid = (a + a2) / 2;
            const pulse = 9 + Math.sin(time * 5 + mid * 7) * 1.4;
            const tip = polar(baseRadius + pulse, mid);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      ctx.restore();
    }

    /* ---------------------------------------------------------------- core */

    drawCore(planet, time) {
      const ctx = this.ctx;
      const radius = planet.coreRadius;
      const pulse = 1 + Math.sin(time * 2.6) * 0.045;

      ctx.save();

      // Outer halo.
      const halo = ctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 3.1);
      halo.addColorStop(0, 'rgba(255, 180, 90, 0.55)');
      halo.addColorStop(0.4, 'rgba(255, 120, 40, 0.18)');
      halo.addColorStop(1, 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 3.1, 0, TAU);
      ctx.fill();

      // Body.
      const body = ctx.createRadialGradient(-radius * 0.2, -radius * 0.25, radius * 0.1, 0, 0, radius * pulse);
      body.addColorStop(0, '#fff3d0');
      body.addColorStop(0.35, '#ffc46b');
      body.addColorStop(0.75, '#ff8a3d');
      body.addColorStop(1, '#e4541c');
      ctx.fillStyle = body;
      ctx.shadowColor = 'rgba(255, 150, 60, 0.9)';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(0, 0, radius * pulse, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Orbiting sparks.
      ctx.fillStyle = 'rgba(255, 236, 190, 0.85)';
      for (let i = 0; i < 7; i++) {
        const angle = time * (0.5 + i * 0.11) + (i / 7) * TAU;
        const orbit = radius * (1.9 + Math.sin(time * 1.3 + i) * 0.25);
        const point = polar(orbit, angle);
        ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(time + i));
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Pulsing ring.
      ctx.strokeStyle = 'rgba(255, 190, 110, 0.35)';
      ctx.lineWidth = 1.4;
      const ringPhase = (time * 0.55) % 1;
      ctx.globalAlpha = 1 - ringPhase;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (1 + ringPhase * 2.4), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();
    }

    /* -------------------------------------------------------------- player */

    /**
     * The martian cat is drawn in its own local frame, then rotated so that
     * its feet always point towards the core: the sprite is perpendicular to
     * the surface, exactly as the radial field requires.
     */
    drawCat(player, time) {
      const ctx = this.ctx;
      const s = player.radius / 7.8;
      const squash = player.squash;
      const idle = player.grounded ? Math.sin(time * 6) * 0.35 : 0;

      ctx.save();
      ctx.translate(player.pos.x, player.pos.y);
      ctx.rotate(player.visualAngle + Math.PI / 2);
      ctx.scale(s / squash, s * squash);
      ctx.translate(0, idle);

      // Soft aura.
      ctx.shadowColor = 'rgba(120, 255, 160, 0.55)';
      ctx.shadowBlur = 12;

      // Tail.
      ctx.strokeStyle = '#57c96f';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(5.5, 5);
      ctx.quadraticCurveTo(12, 5.5, 10.5, -3.5);
      ctx.stroke();

      // Feet (touching the ring).
      ctx.fillStyle = '#66dd7c';
      ctx.strokeStyle = '#2f7a45';
      ctx.lineWidth = 1.3;
      for (const x of [-4.2, 4.2]) {
        ctx.beginPath();
        ctx.ellipse(x, 10.2, 3.4, 2.2, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }

      // Body.
      const body = ctx.createRadialGradient(-2, -1, 1, 0, 3, 12);
      body.addColorStop(0, '#b6ffb4');
      body.addColorStop(0.55, '#86f08a');
      body.addColorStop(1, '#54c96c');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 3.6, 7.6, 6.8, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2f7a45';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Ears, behind the head.
      ctx.fillStyle = '#86f08a';
      ctx.strokeStyle = '#2f7a45';
      ctx.lineWidth = 1.3;
      const ears = [
        [[-7.2, -9.5], [-2.6, -9], [-6.4, -16.2]],
        [[7.2, -9.5], [2.6, -9], [6.4, -16.2]],
      ];
      for (const ear of ears) {
        ctx.beginPath();
        ctx.moveTo(ear[0][0], ear[0][1]);
        ctx.lineTo(ear[1][0], ear[1][1]);
        ctx.lineTo(ear[2][0], ear[2][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Inner ears.
      ctx.fillStyle = '#ff9bb8';
      ctx.beginPath();
      ctx.moveTo(-6.2, -10.4);
      ctx.lineTo(-3.6, -10.1);
      ctx.lineTo(-5.9, -14.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6.2, -10.4);
      ctx.lineTo(3.6, -10.1);
      ctx.lineTo(5.9, -14.2);
      ctx.closePath();
      ctx.fill();

      // Head.
      const head = ctx.createRadialGradient(-2, -8, 1, 0, -5, 9);
      head.addColorStop(0, '#c8ffc4');
      head.addColorStop(1, '#7ce885');
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.arc(0, -5.6, 7.7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2f7a45';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Eyes.
      ctx.fillStyle = '#ffffff';
      for (const x of [-3.1, 3.1]) {
        ctx.beginPath();
        ctx.ellipse(x, -6.6, 2.35, 2.7, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#123024';
      for (const x of [-3.1, 3.1]) {
        ctx.beginPath();
        ctx.arc(x + 0.2, -6.4, 1.2, 0, TAU);
        ctx.fill();
      }
      // Eye shine.
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const x of [-3.1, 3.1]) {
        ctx.beginPath();
        ctx.arc(x + 0.7, -7.2, 0.4, 0, TAU);
        ctx.fill();
      }

      // Nose and mouth.
      ctx.fillStyle = '#ff9bb8';
      ctx.beginPath();
      ctx.moveTo(0, -3.9);
      ctx.lineTo(-1.1, -4.6);
      ctx.lineTo(1.1, -4.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2f7a45';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -3.8);
      ctx.quadraticCurveTo(-0.9, -2.6, -1.7, -3.4);
      ctx.moveTo(0, -3.8);
      ctx.quadraticCurveTo(0.9, -2.6, 1.7, -3.4);
      ctx.stroke();

      // Whiskers, from the cheeks outwards.
      ctx.strokeStyle = 'rgba(47, 122, 69, 0.7)';
      ctx.lineWidth = 0.8;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(side * 4.4, -4.4 + i * 1.2);
          ctx.lineTo(side * 10.2, -6.2 + i * 2.2);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  Radius.Renderer = Renderer;
  Radius.Colors = COLORS;
})(window);
