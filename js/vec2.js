/* ---------------------------------------------------------------------------
   Vec2 - minimal immutable 2D vector
   The whole simulation is written with explicit vector operations so the
   vector-calculus layer (js/field.js) reads like the math on paper.
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const Radius = (global.Radius = global.Radius || {});

  class Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }

    static zero() {
      return new Vec2(0, 0);
    }

    static fromPolar(radius, angle) {
      return new Vec2(radius * Math.cos(angle), radius * Math.sin(angle));
    }

    static lerp(a, b, t) {
      return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }

    clone() {
      return new Vec2(this.x, this.y);
    }

    copy(v) {
      this.x = v.x;
      this.y = v.y;
      return this;
    }

    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }

    add(v) {
      return new Vec2(this.x + v.x, this.y + v.y);
    }

    sub(v) {
      return new Vec2(this.x - v.x, this.y - v.y);
    }

    scale(s) {
      return new Vec2(this.x * s, this.y * s);
    }

    addScaled(v, s) {
      return new Vec2(this.x + v.x * s, this.y + v.y * s);
    }

    dot(v) {
      return this.x * v.x + this.y * v.y;
    }

    /** 2D cross product (the z component of the 3D cross product). */
    cross(v) {
      return this.x * v.y - this.y * v.x;
    }

    lenSq() {
      return this.x * this.x + this.y * this.y;
    }

    len() {
      return Math.sqrt(this.lenSq());
    }

    angle() {
      return Math.atan2(this.y, this.x);
    }

    /** Unit vector; returns the zero vector for a null vector. */
    norm() {
      const l = this.len();
      return l > 1e-9 ? new Vec2(this.x / l, this.y / l) : new Vec2(0, 0);
    }

    /**
     * Rotate +90 degrees in screen space (y grows downwards).
     * For a radial unit vector u this gives the tangent that points to the
     * character's right, matching a growing polar angle.
     */
    perp() {
      return new Vec2(-this.y, this.x);
    }

    rotate(angle) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
    }

    equals(v) {
      return this.x === v.x && this.y === v.y;
    }
  }

  Radius.Vec2 = Vec2;
})(window);
