// ============================================================================
// PARRY-PULSE — Juice Manager
//
// Everything that makes hits FEEL like hits lives here:
//   - Hit-stop: freezes the render loop for N frames on big impacts
//   - Screen shake: decaying random camera offset
//   - Flash: full-screen color overlay for high-stakes moments
//   - Particles: delegated to ParticleSystem (particles.js)
//
// Usage from main.js:
//   juice.hitStop(4);
//   juice.shake(12, 0.25);
//   juice.flash('#ffffff', 0.12);
//   juice.particles.burst(x, y, '#ffd23f');
// ============================================================================

import { ParticleSystem } from './particles.js';

export class JuiceManager {
  constructor() {
    this.hitStopFrames = 0;
    this.shakeMagnitude = 0;
    this.shakeDuration = 0;
    this.shakeTimer = 0;
    this.flashColor = null;
    this.flashDuration = 0;
    this.flashTimer = 0;
    this.particles = new ParticleSystem();
    this.shakeOffset = { x: 0, y: 0 };
    this.shakePhase = 0;
    this.cinematic = null;
  }

  /** Freeze rendering for `frames` renders (at ~60fps, 3-5 frames = 50-85ms). */
  hitStop(frames) {
    this.hitStopFrames = Math.max(this.hitStopFrames, frames);
  }

  /** Trigger camera shake. Magnitude in pixels, duration in seconds. */
  shake(magnitude, duration = 0.2) {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  /** A local kill-camera: slows particles and punches the view toward the victim. */
  deathCinematic(x, y) {
    this.cinematic = { x, y, duration: 0.78, timer: 0.78 };
    this.hitStop(5);
    this.shake(24, 0.42);
  }

  /** Full-screen color flash (e.g. white on a big parry, red on a kill). */
  flash(color, duration = 0.15) {
    this.flashColor = color;
    this.flashDuration = duration;
    this.flashTimer = duration;
  }

  /** Returns true if the caller should SKIP advancing simulation/animation
   *  this frame (i.e. we are inside a hit-stop freeze). Still returns false
   *  (i.e. "keep going") once the freeze naturally expires. */
  consumeHitStop() {
    if (this.hitStopFrames > 0) {
      this.hitStopFrames--;
      return true;
    }
    return false;
  }

  update(dt) {
    const slowMotion = this.cinematic?.timer > 0 ? 0.38 : 1;
    this.particles.update(dt * slowMotion);

    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const t = Math.max(0, this.shakeTimer / this.shakeDuration);
      const mag = this.shakeMagnitude * t;
      this.shakePhase += dt * 42;
      this.shakeOffset.x = (Math.sin(this.shakePhase * 1.73) + Math.sin(this.shakePhase * 3.17) * 0.45) * mag * 0.62;
      this.shakeOffset.y = (Math.cos(this.shakePhase * 2.21) + Math.sin(this.shakePhase * 4.73) * 0.35) * mag * 0.55;
      if (this.shakeTimer <= 0) {
        this.shakeOffset.x = 0;
        this.shakeOffset.y = 0;
        this.shakeMagnitude = 0;
      }
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashColor = null;
    }

    if (this.cinematic) {
      this.cinematic.timer -= dt;
      if (this.cinematic.timer <= 0) this.cinematic = null;
    }
  }

  /** Call right after ctx.save(), before drawing the world, to apply shake. */
  applyCamera(ctx, width, height) {
    if (this.cinematic) {
      const progress = 1 - this.cinematic.timer / this.cinematic.duration;
      const zoom = 1 + Math.sin(progress * Math.PI) * 0.16;
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-this.cinematic.x, -this.cinematic.y);
    }
    ctx.translate(this.shakeOffset.x, this.shakeOffset.y);
  }

  /** Call last, after ctx.restore(), to draw the flash overlay on top of everything. */
  drawFlash(ctx, width, height) {
    if (!this.flashColor || this.flashTimer <= 0) return;
    const alpha = Math.max(0, this.flashTimer / this.flashDuration);
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
