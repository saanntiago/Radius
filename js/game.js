/* ---------------------------------------------------------------------------
   GAME - state machine, input, HUD and the fixed-step simulation loop
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});
  const CONFIG = Radius.CONFIG;
  const { Vec2 } = Radius;

  function randomSeed() {
    return Math.floor(Math.random() * 1e9);
  }

  function formatTime(seconds) {
    return seconds.toFixed(1) + ' s';
  }

  function formatVec(v, digits = 1) {
    return '(' + v.x.toFixed(digits) + ', ' + v.y.toFixed(digits) + ')';
  }

  class Game {
    constructor(canvas) {
      this.field = new Radius.RadialGravityField({
        strength: CONFIG.gravity.strength,
        profile: 'uniform',
      });

      this.renderer = new Radius.Renderer(canvas, this.field);
      this.particles = new Radius.Particles(this.field);

      this.player = new Radius.Player(this.field, {
        onDeath: () => this.onPlayerDeath(),
        onJump: (pos) => this.onPlayerJump(pos),
        onLand: (pos, impact) => this.onPlayerLand(pos, impact),
        onTrail: (pos) => this.onPlayerTrail(pos),
      });

      this.state = 'menu';
      this.previousState = 'menu';
      this.levelIndex = 0;
      this.seed = randomSeed();
      this.planet = Radius.createPlanet(0, this.seed);

      this.input = { left: false, right: false, jump: false };
      this.showField = true;
      this.showMath = false;

      this.time = 0;
      this.levelTime = 0;
      this.totalTime = 0;
      this.clearTimer = 0;
      this.deathTimer = 0;
      this.shake = 0;
      this.flash = 0;

      this.accumulator = 0;
      this.lastFrame = 0;
      this.uiClock = 0;
      this.bannerTimer = null;

      this.dom = this.collectDom();
      this.bindEvents();
      this.showMenuScene();
    }

    /* ----------------------------------------------------------------- dom */

    collectDom() {
      const byId = (id) => document.getElementById(id);
      return {
        hud: byId('hud'),
        hudLevel: byId('hud-level'),
        hudTime: byId('hud-time'),
        hudSeed: byId('hud-seed'),
        btnField: byId('btn-field'),
        btnMath: byId('btn-math'),
        btnPause: byId('btn-pause'),
        banner: byId('banner'),
        bannerKicker: byId('banner-kicker'),
        bannerTitle: byId('banner-title'),
        bannerSub: byId('banner-sub'),
        mathPanel: byId('math-panel'),
        menu: byId('menu'),
        clear: byId('clear'),
        win: byId('win'),
        pause: byId('pause'),
        btnStart: byId('btn-start'),
        btnNext: byId('btn-next'),
        btnRestart: byId('btn-restart'),
        btnResume: byId('btn-resume'),
        clearLevel: byId('clear-level'),
        clearTime: byId('clear-time'),
        winTime: byId('win-time'),
        touch: byId('touch'),
        mPos: byId('m-pos'),
        mField: byId('m-field'),
        mMag: byId('m-mag'),
        mDiv: byId('m-div'),
        mCurl: byId('m-curl'),
        mPot: byId('m-pot'),
        mEnergy: byId('m-energy'),
      };
    }

    bindEvents() {
      window.addEventListener('keydown', (event) => this.onKeyDown(event));
      window.addEventListener('keyup', (event) => this.onKeyUp(event));
      window.addEventListener('resize', () => this.renderer.resize());
      window.addEventListener('blur', () => {
        if (this.state === 'playing') this.togglePause();
      });

      this.dom.btnStart.addEventListener('click', () => this.startGame());
      this.dom.btnNext.addEventListener('click', () => this.nextLevel());
      this.dom.btnRestart.addEventListener('click', () => this.restartGame());
      this.dom.btnResume.addEventListener('click', () => this.togglePause());
      this.dom.btnField.addEventListener('click', () => this.toggleField());
      this.dom.btnMath.addEventListener('click', () => this.toggleMath());
      this.dom.btnPause.addEventListener('click', () => this.togglePause());

      const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
      if (isTouch) {
        this.dom.touch.classList.remove('is-hidden');
        for (const button of this.dom.touch.querySelectorAll('[data-action]')) {
          const action = button.dataset.action;
          const press = (event) => {
            event.preventDefault();
            this.pressTouch(action, true);
          };
          const release = (event) => {
            event.preventDefault();
            this.pressTouch(action, false);
          };
          button.addEventListener('pointerdown', press);
          button.addEventListener('pointerup', release);
          button.addEventListener('pointercancel', release);
          button.addEventListener('pointerleave', release);
        }
      }
    }

    pressTouch(action, pressed) {
      if (action === 'left') this.input.left = pressed;
      if (action === 'right') this.input.right = pressed;
      if (action === 'jump' && pressed) this.input.jump = true;
    }

    onKeyDown(event) {
      const code = event.code;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) {
        event.preventDefault();
      }

      switch (code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.input.left = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.input.right = true;
          break;
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          if (!event.repeat) this.input.jump = true;
          break;
        case 'KeyF':
          if (!event.repeat) this.toggleField();
          break;
        case 'KeyM':
          if (!event.repeat) this.toggleMath();
          break;
        case 'KeyP':
        case 'Escape':
          if (!event.repeat) this.togglePause();
          break;
        case 'KeyR':
          if (!event.repeat) this.restartLevel();
          break;
        case 'Enter':
          this.onConfirm();
          break;
        default:
          break;
      }
    }

    onKeyUp(event) {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.input.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.input.right = false;
          break;
        default:
          break;
      }
    }

    onConfirm() {
      if (this.state === 'menu') this.startGame();
      else if (this.state === 'clear') this.nextLevel();
      else if (this.state === 'won') this.restartGame();
      else if (this.state === 'paused') this.togglePause();
    }

    /* --------------------------------------------------------------- states */

    showMenuScene() {
      // A richer planet as an attract screen behind the menu.
      this.planet = Radius.createPlanet(2, this.seed);
      this.player.reset(this.planet);
      this.state = 'menu';
      this.syncUi();
    }

    startGame() {
      this.totalTime = 0;
      this.seed = randomSeed();
      this.hideOverlays();
      this.startLevel(0, this.seed);
    }

    restartGame() {
      this.startGame();
    }

    startLevel(index, seed) {
      this.levelIndex = index;
      this.seed = seed ?? randomSeed();
      this.planet = Radius.createPlanet(index, this.seed);
      this.player.reset(this.planet);
      this.particles.clear();

      this.levelTime = 0;
      this.deathTimer = 0;
      this.clearTimer = 0;
      this.shake = 0;
      this.flash = 0;
      this.input.jump = false;
      this.state = 'playing';

      this.hideOverlays();
      this.dom.hud.classList.remove('is-hidden');
      this.showBanner(index);
      this.syncUi();
      this.updateHud(true);
    }

    nextLevel() {
      if (this.state !== 'clear') return;
      if (this.levelIndex + 1 >= Radius.LEVELS.length) {
        this.showWin();
        return;
      }
      this.startLevel(this.levelIndex + 1);
    }

    restartLevel() {
      if (this.state === 'menu' || this.state === 'won') return;
      this.startLevel(this.levelIndex, this.seed);
    }

    togglePause() {
      if (this.state === 'playing') {
        this.previousState = 'playing';
        this.state = 'paused';
        this.dom.pause.classList.remove('is-hidden');
      } else if (this.state === 'paused') {
        this.state = this.previousState;
        this.dom.pause.classList.add('is-hidden');
      }
      this.syncUi();
    }

    /* ------------------------------------------------------------- gameplay */

    onPlayerDeath() {
      if (this.state !== 'playing') return;

      this.state = 'dying';
      this.deathTimer = 1.15;
      this.shake = 16;
      this.flash = 0.55;

      // The particles are pulled by the same field, so the explosion slowly
      // collapses back towards the core.
      this.particles.burst(this.player.pos, 46, {
        speed: 260,
        life: 1.1,
        size: 2.8,
        color: '#ff6b7a',
        pull: 0.9,
        glow: 10,
      });
      this.particles.burst(this.player.pos, 18, {
        speed: 140,
        life: 0.9,
        size: 2.2,
        color: '#ffd27a',
        pull: 0.5,
        glow: 8,
      });
    }

    onPlayerJump(pos) {
      const u = pos.norm();
      this.particles.burst(pos, 8, {
        speed: 70,
        angle: Math.atan2(u.y, u.x) + Math.PI,
        spread: 1.6,
        life: 0.4,
        size: 1.8,
        color: '#b6ffb4',
        pull: 0.2,
      });
      this.shake = Math.max(this.shake, 2.5);
    }

    onPlayerLand(pos, impact) {
      const u = pos.norm();
      const angle = Math.atan2(u.y, u.x) + Math.PI;
      this.particles.burst(pos, 6 + Math.min(10, Math.round(impact / 60)), {
        speed: 90,
        angle,
        spread: 2.2,
        life: 0.45,
        size: 1.6,
        color: 'rgba(180, 235, 255, 0.9)',
        pull: 0.15,
      });
      this.shake = Math.max(this.shake, Math.min(6, impact / 140));
    }

    onPlayerTrail(pos) {
      this.particles.spawn({
        pos,
        vel: Vec2.zero(),
        life: 0.35,
        size: 1.9,
        color: 'rgba(140, 255, 190, 0.8)',
        drag: 3,
        glow: 6,
      });
    }

    completeLevel() {
      if (this.state !== 'playing') return;

      this.state = 'clear';
      this.clearTimer = 1.15;
      this.totalTime += this.levelTime;
      this.shake = 8;

      // A burst that falls into the core: the field wins.
      this.particles.burst(Vec2.zero(), 60, {
        speed: 210,
        life: 1.2,
        size: 2.6,
        color: '#ffd27a',
        pull: 0.4,
        glow: 12,
      });
    }

    showLevelCleared() {
      this.dom.clearLevel.textContent = String(this.levelIndex + 1);
      this.dom.clearTime.textContent = formatTime(this.levelTime);
      this.dom.clear.classList.remove('is-hidden');
      this.dom.hud.classList.add('is-hidden');
      this.syncUi();
    }

    showWin() {
      this.state = 'won';
      this.dom.winTime.textContent = formatTime(this.totalTime);
      this.dom.win.classList.remove('is-hidden');
      this.dom.clear.classList.add('is-hidden');
      this.dom.hud.classList.add('is-hidden');
      this.syncUi();
    }

    /* ----------------------------------------------------------------- loop */

    start() {
      this.lastFrame = performance.now();
      const frame = (now) => {
        this.frame(now);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    frame(now) {
      const dt = Math.min((now - this.lastFrame) / 1000, CONFIG.loop.maxFrame);
      this.lastFrame = now;

      this.accumulator += dt;
      const step = CONFIG.loop.fixedStep;
      let guard = 0;
      while (this.accumulator >= step && guard < 8) {
        this.update(step);
        this.accumulator -= step;
        guard++;
      }
      if (guard === 8) this.accumulator = 0;

      this.render(dt);
    }

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - this.shake * Math.min(1, dt * 9) - dt * 2);
      this.flash = Math.max(0, this.flash - dt * 1.8);

      switch (this.state) {
        case 'menu':
          this.planet.update(dt);
          break;

        case 'playing': {
          this.levelTime += dt;
          this.planet.update(dt);
          this.player.update(dt, this.input, this.planet);
          this.particles.update(dt);
          this.input.jump = false;

          if (!this.player.dead && this.player.pos.len() <= this.planet.coreRadius + this.player.radius * 0.55) {
            this.completeLevel();
          }

          this.uiClock += dt;
          if (this.uiClock > 0.08) {
            this.uiClock = 0;
            this.updateHud(false);
            this.updateMathPanel();
          }
          break;
        }

        case 'dying':
          this.planet.update(dt);
          this.particles.update(dt);
          this.deathTimer -= dt;
          if (this.deathTimer <= 0) this.startLevel(this.levelIndex, this.seed);
          break;

        case 'clear':
          this.planet.update(dt);
          this.particles.update(dt);
          this.clearTimer -= dt;
          if (this.clearTimer <= 0 && this.dom.clear.classList.contains('is-hidden')) {
            if (this.levelIndex + 1 >= Radius.LEVELS.length) this.showWin();
            else this.showLevelCleared();
          }
          break;

        case 'won':
          this.planet.update(dt);
          this.particles.update(dt);
          break;

        case 'paused':
        default:
          break;
      }
    }

    render() {
      this.renderer.render({
        time: this.time,
        planet: this.planet,
        player: this.player,
        particles: this.particles,
        fieldVisible: this.showField,
        shake: this.shake,
        flash: this.flash,
      });
    }

    /* ------------------------------------------------------------------ ui */

    syncUi() {
      this.dom.btnField.setAttribute('aria-pressed', String(this.showField));
      this.dom.btnMath.setAttribute('aria-pressed', String(this.showMath));

      const showMath =
        this.showMath &&
        (this.state === 'playing' || this.state === 'paused' || this.state === 'dying');
      this.dom.mathPanel.classList.toggle('is-hidden', !showMath);

      const inMenu = this.state === 'menu';
      this.dom.menu.classList.toggle('is-hidden', !inMenu);
      this.dom.hud.classList.toggle('is-hidden', inMenu || this.state === 'clear' || this.state === 'won');

      this.dom.touch.classList.toggle('is-hidden', inMenu || this.state !== 'playing' || !this.isTouchDevice());
    }

    isTouchDevice() {
      return matchMedia('(hover: none), (pointer: coarse)').matches;
    }

    toggleField() {
      this.showField = !this.showField;
      this.syncUi();
    }

    toggleMath() {
      this.showMath = !this.showMath;
      this.syncUi();
      if (this.showMath) this.updateMathPanel();
    }

    hideOverlays() {
      this.dom.menu.classList.add('is-hidden');
      this.dom.clear.classList.add('is-hidden');
      this.dom.win.classList.add('is-hidden');
      this.dom.pause.classList.add('is-hidden');
    }

    showBanner(index) {
      const level = Radius.LEVELS[index];
      const features = [];
      features.push(level.rings + ' anillos');
      if (level.hazards > 0) features.push('púas');
      if (level.rotors.length > 0) features.push('anillos giratorios');

      this.dom.bannerKicker.textContent = 'NIVEL ' + (index + 1);
      this.dom.bannerTitle.textContent = level.name;
      this.dom.bannerSub.textContent = features.join(' · ');

      const banner = this.dom.banner;
      banner.classList.remove('is-hidden');
      banner.style.animation = 'none';
      void banner.offsetWidth;
      banner.style.animation = '';

      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => banner.classList.add('is-hidden'), 2700);
    }

    updateHud(force) {
      if (!force && this.state !== 'playing') return;
      this.dom.hudLevel.textContent = String(this.levelIndex + 1);
      this.dom.hudTime.textContent = this.levelTime.toFixed(1);
      this.dom.hudSeed.textContent = String(this.seed % 10000).padStart(4, '0');
    }

    /** Live evaluation of the field at the player position. */
    updateMathPanel() {
      if (!this.showMath || this.state === 'menu') return;

      const p = this.player.pos;
      const F = this.field.field(p);
      const v = this.player.vel;
      const kinetic = 0.5 * v.lenSq();
      const potential = this.field.potential(p);

      this.dom.mPos.textContent = formatVec(p);
      this.dom.mField.textContent = formatVec(F);
      this.dom.mMag.textContent = this.field.magnitude(p).toFixed(1);
      this.dom.mDiv.textContent = this.field.numericalDivergence(p).toFixed(3);
      this.dom.mCurl.textContent = this.field.numericalCurl(p).toFixed(3);
      this.dom.mPot.textContent = potential.toFixed(1);
      this.dom.mEnergy.textContent = (kinetic + potential).toFixed(1);
    }
  }

  Radius.Game = Game;
})(window);
