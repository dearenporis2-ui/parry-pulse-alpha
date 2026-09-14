const C = require('./constants');

let nextId = 1;

/**
 * Authoritative bullet. Bullets are simple kinematic points that can be
 * re-owned and re-launched when deflected by a katana parry.
 */
class Bullet {
  constructor(x, y, angle, ownerId, team, speed = C.BULLET_SPEED, damage = C.BULLET_DAMAGE) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.speed = speed;
    this.ownerId = ownerId;
    this.team = team;
    this.damage = damage;
    this.supercharged = false;
    this.deflectCount = 0;
    this.createdAt = Date.now();
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** Re-launch this bullet in a new direction at a new speed (used on parry). */
  deflect(newAngle, newSpeed, newDamage, newOwnerId, newTeam, supercharged) {
    this.angle = newAngle;
    this.vx = Math.cos(newAngle) * newSpeed;
    this.vy = Math.sin(newAngle) * newSpeed;
    this.speed = newSpeed;
    this.damage = newDamage;
    this.ownerId = newOwnerId;
    this.team = newTeam;
    this.supercharged = supercharged || this.supercharged;
    this.deflectCount += 1;
  }

  isExpired(now) {
    return now - this.createdAt > C.BULLET_LIFETIME_MS;
  }

  serialize() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: this.angle,
      team: this.team,
      supercharged: this.supercharged,
    };
  }
}

module.exports = Bullet;
