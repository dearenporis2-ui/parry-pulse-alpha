const C = require('./constants');
const Player = require('./Player');
const Bullet = require('./Bullet');
const GunPickup = require('./GunPickup');

const SPAWN_POINTS = {
  [C.TEAM_A]: [
    { x: 140, y: 300 },
    { x: 140, y: 600 },
  ],
  [C.TEAM_B]: [
    { x: C.ARENA_WIDTH - 140, y: 300 },
    { x: C.ARENA_WIDTH - 140, y: 600 },
  ],
};

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function circleRectOverlap(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < radius * radius;
}

function isFiniteAngle(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Returns the first point (0..1) where a segment reaches a circle, or null.
// This removes high-speed bullets tunnelling through a player between 30 Hz ticks.
function segmentCircleHit(x, y, dx, dy, cx, cy, radius) {
  const ox = x - cx;
  const oy = y - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a === 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

// Segment against a rectangle inflated by the bullet radius (slab test).
function segmentRectHit(x, y, dx, dy, rect, radius) {
  const minX = rect.x - radius, maxX = rect.x + rect.w + radius;
  const minY = rect.y - radius, maxY = rect.y + rect.h + radius;
  let near = 0, far = 1;
  for (const [start, delta, min, max] of [[x, dx, minX, maxX], [y, dy, minY, maxY]]) {
    if (delta === 0) {
      if (start < min || start > max) return null;
      continue;
    }
    const t1 = (min - start) / delta;
    const t2 = (max - start) / delta;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }
  return near;
}

/**
 * GameRoom owns exactly one 2v2 match. Today the server only ever creates a
 * single GameRoom (a "fixed lobby") so you can test with 4 browser tabs.
 *
 * To upgrade to room codes later: keep a Map<roomCode, GameRoom> in server.js,
 * generate a code on 'create_room', and route new sockets to the right room
 * on 'join_room' instead of always calling the single instance's addPlayer().
 * Nothing in this class needs to change to support that.
 */
class GameRoom {
  constructor() {
    this.players = new Map(); // id -> Player
    this.bullets = [];
    this.gunPickups = [];
    this.nextGunSpawnAt = 0;
    this.obstacles = C.OBSTACLES;
    this.events = []; // juice events queued this tick, flushed to clients

    this.scoreA = 0;
    this.scoreB = 0;
    this.roundActive = false;
    this.roundStartedAt = 0;
    this.matchOver = false;
    this.winner = null;
    this.pendingRoundRestartAt = null;

    this._lastTick = Date.now();
  }

  get playerCount() {
    return this.players.size;
  }

  isFull() {
    return this.players.size >= 4;
  }

  nextTeam() {
    let a = 0, b = 0;
    for (const p of this.players.values()) {
      if (p.team === C.TEAM_A) a++; else b++;
    }
    return a <= b ? C.TEAM_A : C.TEAM_B;
  }

  nextSpawnPoint(team) {
    const teamPlayers = [...this.players.values()].filter((p) => p.team === team);
    const points = SPAWN_POINTS[team];
    return points[teamPlayers.length % points.length];
  }

  addPlayer(ws, name, ability) {
    const team = this.nextTeam();
    const spawn = this.nextSpawnPoint(team);
    const player = new Player(ws, name, team, spawn, ability);
    this.players.set(player.id, player);

    if (!this.roundActive && this.players.size >= 2) {
      this.startRound();
    }
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.players.size === 0) {
      this.resetMatch();
    }
  }

  // -------------------------------------------------------------------
  // Input handling (called directly from server.js message router)
  // -------------------------------------------------------------------

  handleInput(player, msg) {
    if (msg.keys) {
      player.keys.up = !!msg.keys.up;
      player.keys.down = !!msg.keys.down;
      player.keys.left = !!msg.keys.left;
      player.keys.right = !!msg.keys.right;
    }
    if (isFiniteAngle(msg.angle)) {
      player.angle = msg.angle;
    }
  }

  handleShoot(player, msg) {
    if (!this.roundActive || this.matchOver || player.weapon !== 'revolver' || !player.gunType) return;
    if (!player.canShoot()) return;
    const now = Date.now();
    const gun = C.GUNS[player.gunType];
    if (!gun || now - player.lastShotTime < gun.cooldown) return;
    player.lastShotTime = now;

    const angle = isFiniteAngle(msg.angle) ? msg.angle : player.angle;
    const spawnDist = C.PLAYER_RADIUS + C.BULLET_RADIUS + 4;
    const bx = player.x + Math.cos(angle) * spawnDist;
    const by = player.y + Math.sin(angle) * spawnDist;
    const bullet = new Bullet(bx, by, angle, player.id, player.team, gun.speed, gun.damage);
    this.bullets.push(bullet);

    this.events.push({ kind: 'shoot', x: bx, y: by, angle, team: player.team, playerId: player.id, gunType: player.gunType });
  }

  handleSlash(player, msg) {
    if (!this.roundActive || this.matchOver || player.weapon !== 'sword') return;
    if (!player.canSlash()) return;

    const angle = isFiniteAngle(msg.angle) ? msg.angle : player.angle;
    player.angle = angle;
    player.state = 'swinging';
    player.swingStartTime = Date.now();
    player.swingAngle = angle;
    player.parriedThisSwing.clear();

    this.events.push({ kind: 'slash', x: player.x, y: player.y, angle, team: player.team, playerId: player.id });
  }

  handleDash(player, msg) {
    if (!this.roundActive || this.matchOver || !player.canDash()) return;
    const now = Date.now();
    const angle = isFiniteAngle(msg.angle) ? msg.angle : player.angle;
    const dash = this._dashPlayer(player, angle, now);
    this.events.push({
      kind: 'dash', ...dash, angle, team: player.team, playerId: player.id, dashCharges: player.dashCharges,
    });
  }

  handleDashStrike(player, msg) {
    if (!this.roundActive || this.matchOver || player.weapon !== 'sword' || !player.canDashStrike()) return;
    const now = Date.now();
    const angle = isFiniteAngle(msg.angle) ? msg.angle : player.angle;
    const dash = this._dashPlayer(player, angle, now, C.DASH_STRIKE_DISTANCE, false);
    player.spendDashStrike(now);
    player.state = 'dashStriking';
    player.dashStrikeAngle = angle;
    player.dashStrikeActiveUntil = now + C.DASH_STRIKE_ACTIVE_MS;
    player.stateEndsAt = player.dashStrikeActiveUntil + C.DASH_STRIKE_RECOVERY_MS;
    player.dashStrikeHits.clear();
    player.dashStrikeStart = { x: dash.x, y: dash.y };
    player.dashStrikeEnd = { x: dash.toX, y: dash.toY };
    this.events.push({
      kind: 'dashStrike', ...dash, angle, team: player.team, playerId: player.id, strikeEnergy: Math.round(player.strikeEnergy),
    });
  }

  handleWeapon(player, msg) {
    if (msg.weapon === 'sword' || (msg.weapon === 'revolver' && player.gunType)) player.weapon = msg.weapon;
  }

  handleAbility(player, msg) {
    const now = Date.now();
    if (!this.roundActive || this.matchOver || !player.canUseAbility(now)) return;
    if (player.ability === 'blink') {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      const dx = msg.x - player.x, dy = msg.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > C.BLINK_RANGE || this._collidesObstacle(msg.x, msg.y, C.PLAYER_RADIUS)) return;
      player.x = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_WIDTH - C.PLAYER_RADIUS, msg.x));
      player.y = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_HEIGHT - C.PLAYER_RADIUS, msg.y));
      player.vx = 0; player.vy = 0;
      this.events.push({ kind: 'blink', x: player.x - dx, y: player.y - dy, toX: player.x, toY: player.y, team: player.team, playerId: player.id });
    } else {
      for (const target of this.players.values()) {
        if (!target.alive || target.team === player.team) continue;
        const dx = target.x - player.x, dy = target.y - player.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > C.PULSE_RADIUS) continue;
        const force = C.PULSE_KNOCKBACK * (1 - distance / C.PULSE_RADIUS);
        target.vx += (dx / distance) * force;
        target.vy += (dy / distance) * force;
      }
      this.events.push({ kind: 'pulse', x: player.x, y: player.y, team: player.team, playerId: player.id });
    }
    player.abilityReadyAt = now + C.ABILITY_COOLDOWN_MS;
  }

  _dashPlayer(player, angle, now, distance = C.DASH_DISTANCE, spendsDash = true) {
    const startX = player.x;
    const startY = player.y;
    player.angle = angle;
    if (spendsDash) player.spendDash(now);

    // Sweep the path in small pieces. This prevents blinking through cover or arena walls.
    const steps = Math.ceil(distance / 8);
    for (let i = 1; i <= steps; i++) {
      const stepDistance = (distance * i) / steps;
      const x = startX + Math.cos(angle) * stepDistance;
      const y = startY + Math.sin(angle) * stepDistance;
      const clampedX = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_WIDTH - C.PLAYER_RADIUS, x));
      const clampedY = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_HEIGHT - C.PLAYER_RADIUS, y));
      if (this._collidesObstacle(clampedX, clampedY, C.PLAYER_RADIUS)) break;
      player.x = clampedX;
      player.y = clampedY;
    }
    return { x: startX, y: startY, toX: player.x, toY: player.y };
  }

  // -------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------

  update() {
    const now = Date.now();
    const dt = Math.min((now - this._lastTick) / 1000, 0.1);
    this._lastTick = now;

    if (this.matchOver) return;

    if (this.pendingRoundRestartAt && now >= this.pendingRoundRestartAt) {
      this.pendingRoundRestartAt = null;
      this.startRound();
    }

    if (!this.roundActive) return;

    this._updatePlayers(dt, now);
    this._updateGunPickups(now);
    this._updateBullets(dt, now);
    this._checkRoundTimeout(now);
  }

  _updatePlayers(dt, now) {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      player.updateDashCharges(now);
      player.updateStrikeEnergy(now, dt);

      // State machine transitions
      if (player.state === 'swinging') {
        const elapsed = now - player.swingStartTime;
        if (elapsed > C.SWING_ACTIVE_MS) {
          player.state = 'recovering';
          player.stateEndsAt = player.swingStartTime + C.SWING_ACTIVE_MS + C.SWING_RECOVERY_MS;
        }
      } else if (player.state === 'dashStriking' && now >= player.dashStrikeActiveUntil) {
        player.state = 'recovering';
      } else if (player.state === 'recovering' || player.state === 'cooldown') {
        if (now >= player.stateEndsAt) player.state = 'idle';
      }

      // Momentum movement: accelerate toward input, then coast and brake rather than stopping instantly.
      let dx = 0, dy = 0;
      if (player.keys.up) dy -= 1;
      if (player.keys.down) dy += 1;
      if (player.keys.left) dx -= 1;
      if (player.keys.right) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        const targetX = (dx / len) * player.currentSpeed();
        const targetY = (dy / len) * player.currentSpeed();
        const step = C.PLAYER_ACCELERATION * dt;
        player.vx += Math.max(-step, Math.min(step, targetX - player.vx));
        player.vy += Math.max(-step, Math.min(step, targetY - player.vy));
      } else {
        const speed = Math.hypot(player.vx, player.vy);
        const nextSpeed = Math.max(0, speed - C.PLAYER_BRAKE * dt);
        if (speed > 0) { player.vx *= nextSpeed / speed; player.vy *= nextSpeed / speed; }
      }
      const movedX = this._resolveCollision(player.x + player.vx * dt, player.y, player.x, player.y, C.PLAYER_RADIUS);
      if (movedX.x === player.x) player.vx = 0;
      player.x = movedX.x;
      const movedY = this._resolveCollision(player.x, player.y + player.vy * dt, player.x, player.y, C.PLAYER_RADIUS);
      if (movedY.y === player.y) player.vy = 0;
      player.y = movedY.y;

      player.x = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_WIDTH - C.PLAYER_RADIUS, player.x));
      player.y = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_HEIGHT - C.PLAYER_RADIUS, player.y));
    }

    this._updateDashStrikes(now);

    // Simple mutual separation so players can't stack on top of each other
    const list = [...this.players.values()].filter((p) => p.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = C.PLAYER_RADIUS * 2;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  _updateGunPickups(now) {
    if (this.gunPickups.length < C.GUN_PICKUP_MAX && now >= this.nextGunSpawnAt) {
      const used = new Set(this.gunPickups.map((p) => `${p.x},${p.y}`));
      const choices = C.GUN_PICKUP_POINTS.filter((p) => !used.has(`${p.x},${p.y}`));
      if (choices.length) {
        const point = choices[Math.floor(Math.random() * choices.length)];
        const type = Math.random() < 0.55 ? 'pistol' : 'rifle';
        const pickup = new GunPickup(type, point);
        this.gunPickups.push(pickup);
        this.events.push({ kind: 'gunSpawn', ...pickup.serialize() });
      }
      this.nextGunSpawnAt = now + C.GUN_PICKUP_RESPAWN_MS;
    }
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const pickupIndex = this.gunPickups.findIndex((pickup) => Math.hypot(player.x - pickup.x, player.y - pickup.y) <= C.GUN_PICKUP_RADIUS + C.PLAYER_RADIUS);
      if (pickupIndex < 0) continue;
      const [pickup] = this.gunPickups.splice(pickupIndex, 1);
      player.gunType = pickup.type;
      player.weapon = 'revolver';
      this.events.push({ kind: 'gunPickup', x: pickup.x, y: pickup.y, type: pickup.type, playerId: player.id, team: player.team });
    }
  }

  _updateDashStrikes(now) {
    for (const attacker of this.players.values()) {
      if (attacker.state !== 'dashStriking' || now > attacker.dashStrikeActiveUntil) continue;
      for (const defender of this.players.values()) {
        if (!defender.alive || defender.team === attacker.team || attacker.dashStrikeHits.has(defender.id)) continue;
        const start = attacker.dashStrikeStart;
        const end = attacker.dashStrikeEnd;
        if (!start || !end) continue;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const hitT = segmentCircleHit(start.x, start.y, dx, dy, defender.x, defender.y, C.PLAYER_RADIUS + C.DASH_STRIKE_HIT_RADIUS);
        if (hitT === null) continue;
        const hitX = start.x + dx * hitT;
        const hitY = start.y + dy * hitT;
        const segmentLengthSquared = dx * dx + dy * dy;
        const closestT = Math.max(0, Math.min(1, ((defender.x - start.x) * dx + (defender.y - start.y) * dy) / segmentLengthSquared));
        const closestX = start.x + dx * closestT;
        const closestY = start.y + dy * closestT;
        const pathDistance = Math.hypot(closestX - defender.x, closestY - defender.y);
        const angleToOrigin = Math.atan2(start.y - defender.y, start.x - defender.x);
        const defenderParries = defender.state === 'swinging' &&
          pathDistance <= C.KATANA_RANGE &&
          angleDiff(angleToOrigin, defender.swingAngle) <= (C.KATANA_ARC_DEG * Math.PI / 180) / 2;

        attacker.dashStrikeHits.add(defender.id);
        if (defenderParries) {
          attacker.state = 'recovering';
          attacker.stateEndsAt = now + C.DASH_STRIKE_RECOVERY_MS;
          const killed = attacker.takeDamage(C.DASH_STRIKE_PARRY_DAMAGE);
          this.events.push({ kind: 'dashParried', x: hitX, y: hitY, team: defender.team, playerId: defender.id, victimId: attacker.id, killed });
          if (killed) this._checkRoundEnd();
        } else {
          const killed = defender.takeDamage(C.DASH_STRIKE_DAMAGE);
          this.events.push({ kind: killed ? 'kill' : 'dashStrikeHit', x: hitX, y: hitY, team: defender.team, victimId: defender.id, attackerId: attacker.id });
          if (killed) this._checkRoundEnd();
        }
        break;
      }
    }
  }

  /** Blocks movement into obstacles by only allowing the axis that doesn't collide. */
  _resolveCollision(nx, ny, ox, oy, radius) {
    if (this._collidesObstacle(nx, ny, radius)) return { x: ox, y: oy };
    return { x: nx, y: ny };
  }

  _collidesObstacle(x, y, radius) {
    return this.obstacles.some((rect) => circleRectOverlap(x, y, radius, rect));
  }

  _updateBullets(dt, now) {
    // 1. Check parries (swinging players vs all live bullets) BEFORE moving bullets
    for (const player of this.players.values()) {
      if (player.state !== 'swinging') continue;
      const elapsed = now - player.swingStartTime;
      if (elapsed > C.SWING_ACTIVE_MS) continue;

      for (const bullet of this.bullets) {
        if (bullet.dead) continue;
        if (player.parriedThisSwing.has(bullet.id)) continue;

        const dist = Math.hypot(bullet.x - player.x, bullet.y - player.y);
        if (dist > C.KATANA_RANGE) continue;

        const angleToBullet = Math.atan2(bullet.y - player.y, bullet.x - player.x);
        const diff = angleDiff(angleToBullet, player.swingAngle);
        if (diff > (C.KATANA_ARC_DEG * Math.PI / 180) / 2) continue;

        // PARRY LANDED
        const wasTeammateBullet = bullet.team === player.team;
        const newSpeed = bullet.speed * (wasTeammateBullet ? C.SUPERCHARGE_SPEED_MULT : C.DEFLECT_SPEED_MULT);
        const newDamage = wasTeammateBullet ? C.SUPERCHARGE_DAMAGE : C.DEFLECT_DAMAGE;
        bullet.deflect(player.angle, newSpeed, newDamage, player.id, player.team, wasTeammateBullet);
        player.parriedThisSwing.add(bullet.id);

        player.state = 'cooldown';
        player.stateEndsAt = now + C.SWING_SUCCESS_COOLDOWN_MS;

        this.events.push({
          kind: 'parry',
          x: bullet.x, y: bullet.y,
          team: player.team,
          supercharged: wasTeammateBullet,
          playerId: player.id,
        });
      }
    }

    // 2. Move bullets, check obstacle/bounds/player collisions
    for (const bullet of this.bullets) {
      // A kill earlier in this same tick may have already decided the round
      // (all of one team dead). Stop resolving further bullet damage this
      // tick so a still-in-flight bullet can't produce a spurious extra
      // kill/roundEnd for the team that just won.
      if (!this.roundActive) break;
      if (bullet.dead) continue;
      const startX = bullet.x;
      const startY = bullet.y;
      const dx = bullet.vx * dt;
      const dy = bullet.vy * dt;

      let obstacleT = null;
      for (const rect of this.obstacles) {
        const t = segmentRectHit(startX, startY, dx, dy, rect, C.BULLET_RADIUS);
        if (t !== null && (obstacleT === null || t < obstacleT)) obstacleT = t;
      }

      let victim = null;
      let victimT = null;
      for (const player of this.players.values()) {
        if (!player.alive || player.id === bullet.ownerId || player.team === bullet.team) continue;
        const t = segmentCircleHit(startX, startY, dx, dy, player.x, player.y, C.PLAYER_RADIUS + C.BULLET_RADIUS);
        if (t !== null && (victimT === null || t < victimT)) {
          victim = player;
          victimT = t;
        }
      }

      // Cover wins ties, so a player cannot be hit through a wall.
      const impactT = obstacleT ?? 1;
      if (victim && victimT <= impactT) {
        bullet.x = startX + dx * victimT;
        bullet.y = startY + dy * victimT;
        bullet.dead = true;
        const killed = victim.takeDamage(bullet.damage);
        this.events.push({
          kind: killed ? 'kill' : 'hit',
          x: victim.x, y: victim.y, team: victim.team, victimId: victim.id,
          attackerId: bullet.ownerId, supercharged: bullet.supercharged,
        });
        if (killed) this._checkRoundEnd();
        continue;
      }

      if (obstacleT !== null) {
        bullet.x = startX + dx * obstacleT;
        bullet.y = startY + dy * obstacleT;
        bullet.dead = true;
        this.events.push({ kind: 'obstacleHit', x: bullet.x, y: bullet.y });
        continue;
      }

      bullet.update(dt);

      if (bullet.isExpired(now) ||
          bullet.x < -20 || bullet.x > C.ARENA_WIDTH + 20 ||
          bullet.y < -20 || bullet.y > C.ARENA_HEIGHT + 20) {
        bullet.dead = true;
        continue;
      }

    }

    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  _checkRoundEnd() {
    if (!this.roundActive) return;
    const teamA = [...this.players.values()].filter((p) => p.team === C.TEAM_A);
    const teamB = [...this.players.values()].filter((p) => p.team === C.TEAM_B);
    const aAlive = teamA.some((p) => p.alive);
    const bAlive = teamB.some((p) => p.alive);

    if (teamA.length > 0 && !aAlive) this._endRound(C.TEAM_B);
    else if (teamB.length > 0 && !bAlive) this._endRound(C.TEAM_A);
  }

  _checkRoundTimeout(now) {
    if (!this.roundActive) return;
    if (now - this.roundStartedAt < C.ROUND_TIME_MS) return;

    const teamA = [...this.players.values()].filter((p) => p.team === C.TEAM_A);
    const teamB = [...this.players.values()].filter((p) => p.team === C.TEAM_B);
    const hpA = teamA.reduce((s, p) => s + (p.alive ? p.hp : 0), 0);
    const hpB = teamB.reduce((s, p) => s + (p.alive ? p.hp : 0), 0);

    if (hpA === hpB) {
      // draw: replay the round with no score change
      this.events.push({ kind: 'roundDraw' });
      this.roundActive = false;
      this.pendingRoundRestartAt = Date.now() + C.ROUND_RESTART_DELAY_MS;
    } else {
      this._endRound(hpA > hpB ? C.TEAM_A : C.TEAM_B);
    }
  }

  _endRound(winningTeam) {
    this.roundActive = false;
    if (winningTeam === C.TEAM_A) this.scoreA++; else this.scoreB++;

    this.events.push({
      kind: 'roundEnd',
      winner: winningTeam,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
    });

    if (this.scoreA >= C.ROUNDS_TO_WIN || this.scoreB >= C.ROUNDS_TO_WIN) {
      this.matchOver = true;
      this.winner = this.scoreA > this.scoreB ? C.TEAM_A : C.TEAM_B;
      this.events.push({ kind: 'matchEnd', winner: this.winner, scoreA: this.scoreA, scoreB: this.scoreB });
    } else {
      this.pendingRoundRestartAt = Date.now() + C.ROUND_RESTART_DELAY_MS;
    }
  }

  startRound() {
    this.bullets = [];
    this.gunPickups = [];
    this.nextGunSpawnAt = Date.now() + 1800;
    for (const player of this.players.values()) {
      const spawn = this.nextSpawnPointFor(player);
      player.respawn(spawn);
    }
    this.roundActive = true;
    this.roundStartedAt = Date.now();
    this.events.push({ kind: 'roundStart', scoreA: this.scoreA, scoreB: this.scoreB });
  }

  nextSpawnPointFor(player) {
    const teamPlayers = [...this.players.values()].filter((p) => p.team === player.team);
    const idx = teamPlayers.indexOf(player);
    const points = SPAWN_POINTS[player.team];
    return points[idx % points.length];
  }

  restartMatch() {
    this.scoreA = 0;
    this.scoreB = 0;
    this.matchOver = false;
    this.winner = null;
    this.startRound();
  }

  resetMatch() {
    this.bullets = [];
    this.gunPickups = [];
    this.scoreA = 0;
    this.scoreB = 0;
    this.roundActive = false;
    this.matchOver = false;
    this.winner = null;
    this.pendingRoundRestartAt = null;
  }

  // -------------------------------------------------------------------
  // Serialization for network broadcast
  // -------------------------------------------------------------------

  serializeState() {
    return {
      type: 'state',
      t: Date.now(),
      players: [...this.players.values()].map((p) => p.serialize()),
      bullets: this.bullets.map((b) => b.serialize()),
      gunPickups: this.gunPickups.map((pickup) => pickup.serialize()),
      round: {
        scoreA: this.scoreA,
        scoreB: this.scoreB,
        active: this.roundActive,
        timeLeft: this.roundActive ? Math.max(0, C.ROUND_TIME_MS - (Date.now() - this.roundStartedAt)) : 0,
      },
      matchOver: this.matchOver,
      winner: this.winner,
    };
  }

  flushEvents() {
    const evts = this.events;
    this.events = [];
    return evts;
  }

  serializeInitFor(player) {
    return {
      type: 'init',
      playerId: player.id,
      team: player.team,
      arena: {
        width: C.ARENA_WIDTH,
        height: C.ARENA_HEIGHT,
        obstacles: this.obstacles,
      },
    };
  }
}

module.exports = GameRoom;
