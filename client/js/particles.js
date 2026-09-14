// ============================================================================
// PARRY-PULSE — Particle System
// Simple pooled-array particle emitter. No external deps.
// ============================================================================

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /** Generic radial burst — used for bullet impacts, parries, kills. */
  burst(x, y, color, count = 14, opts = {}) {
    const speedMin = opts.speedMin ?? 60;
    const speedMax = opts.speedMax ?? 260;
    const life = opts.life ?? 0.45;
    const size = opts.size ?? 3;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size: size * (0.6 + Math.random() * 0.8),
        drag: opts.drag ?? 0.9,
        kind: 'spark',
      });
    }
  }

  /** A single fast-fading streak — used for deflected-bullet tracers. */
  tracer(x, y, angle, color, length = 60) {
    this.particles.push({
      x, y, angle, length,
      life: 0.18,
      maxLife: 0.18,
      color,
      kind: 'tracer',
    });
  }

  dashTrail(x, y, toX, toY, color) {
    const angle = Math.atan2(toY - y, toX - x);
    const distance = Math.hypot(toX - x, toY - y);
    this.particles.push({ x: toX, y: toY, angle, length: Math.max(45, distance), life: 0.22, maxLife: 0.22, color, kind: 'tracer' });
  }

  /** Small puff under a player's feet while moving — cheap "dust". */
  dust(x, y, color) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      life: 0.35,
      maxLife: 0.35,
      color,
      size: 2 + Math.random() * 2,
      drag: 0.92,
      kind: 'spark',
    });
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.kind === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'tracer') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(p.angle) * p.length * t, p.y - Math.sin(p.angle) * p.length * t);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
