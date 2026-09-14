const C = require('./constants');

let nextId = 1;

/**
 * Authoritative server-side representation of a connected player.
 * The client never trusts its own physics — it only renders whatever
 * state this object serializes into.
 */
class Player {
  constructor(ws, name, team, spawnPoint, ability = 'blink') {
    this.id = nextId++;
    this.ws = ws;
    this.name = name || `Player${this.id}`;
    this.team = team; // 'A' | 'B'
    this.weapon = 'sword';
    this.gunType = null;
    this.ability = ability;
    this.abilityReadyAt = 0;

    this.x = spawnPoint.x;
    this.y = spawnPoint.y;
    this.spawnPoint = spawnPoint;

    this.angle = team === C.TEAM_A ? 0 : Math.PI; // facing angle in radians
    this.hp = C.PLAYER_MAX_HP;
    this.alive = true;
    this.vx = 0;
    this.vy = 0;

    // Input state, updated by incoming 'input' messages
    this.keys = { up: false, down: false, left: false, right: false };

    // State machine: 'idle' | 'swinging' | 'dashStriking' | 'recovering' | 'cooldown'
    this.state = 'idle';
    this.swingStartTime = 0;
    this.swingAngle = 0;
    this.stateEndsAt = 0;
    this.parriedThisSwing = new Set(); // bullet ids already deflected by current swing

    this.lastShotTime = 0;
    this.invulnUntil = Date.now() + C.RESPAWN_INVULN_MS;
    this.dashCharges = C.DASH_MAX_CHARGES;
    this.dashRechargeAt = [];
    this.dashVisualUntil = 0;
    this.dashStrikeActiveUntil = 0;
    this.dashStrikeAngle = 0;
    this.dashStrikeHits = new Set();
    this.dashStrikeStart = null;
    this.dashStrikeEnd = null;
    this.strikeEnergy = C.DASH_STRIKE_ENERGY_MAX;
    this.strikeEnergyLastUsedAt = 0;

    this.disconnected = false;
  }

  currentSpeed() {
    if (this.state === 'swinging') return C.PLAYER_SPEED_SWINGING;
    if (this.state === 'recovering') return C.PLAYER_SPEED_RECOVERING;
    return C.PLAYER_SPEED;
  }

  isInvulnerable() {
    return Date.now() < this.invulnUntil;
  }

  canShoot() {
    return this.alive && (this.state === 'idle' || this.state === 'cooldown');
  }

  canSlash() {
    return this.alive && this.state === 'idle';
  }

  canDash() {
    return this.alive && this.state !== 'recovering' && this.dashCharges > 0;
  }

  canDashStrike() {
    return this.alive && this.state === 'idle' && this.strikeEnergy >= C.DASH_STRIKE_ENERGY_COST;
  }

  canUseAbility(now) {
    return this.alive && this.state === 'idle' && now >= this.abilityReadyAt;
  }

  spendDashStrike(now) {
    this.strikeEnergy -= C.DASH_STRIKE_ENERGY_COST;
    this.strikeEnergyLastUsedAt = now;
  }

  updateStrikeEnergy(now, dt) {
    if (now - this.strikeEnergyLastUsedAt < C.DASH_STRIKE_ENERGY_REGEN_DELAY_MS) return;
    this.strikeEnergy = Math.min(C.DASH_STRIKE_ENERGY_MAX, this.strikeEnergy + C.DASH_STRIKE_ENERGY_REGEN_PER_SEC * dt);
  }

  spendDash(now) {
    this.dashCharges--;
    this.dashRechargeAt.push(now + C.DASH_RECHARGE_MS);
    this.dashVisualUntil = now + C.DASH_VISUAL_MS;
  }

  updateDashCharges(now) {
    while (this.dashRechargeAt.length && this.dashRechargeAt[0] <= now) {
      this.dashRechargeAt.shift();
      this.dashCharges = Math.min(C.DASH_MAX_CHARGES, this.dashCharges + 1);
    }
  }

  respawn(spawnPoint) {
    this.x = spawnPoint.x;
    this.y = spawnPoint.y;
    this.hp = C.PLAYER_MAX_HP;
    this.alive = true;
    this.vx = 0;
    this.vy = 0;
    this.gunType = null;
    this.weapon = 'sword';
    this.state = 'idle';
    this.parriedThisSwing.clear();
    this.invulnUntil = Date.now() + C.RESPAWN_INVULN_MS;
    this.dashCharges = C.DASH_MAX_CHARGES;
    this.dashRechargeAt = [];
    this.dashVisualUntil = 0;
    this.dashStrikeActiveUntil = 0;
    this.dashStrikeHits.clear();
    this.dashStrikeStart = null;
    this.dashStrikeEnd = null;
    this.strikeEnergy = C.DASH_STRIKE_ENERGY_MAX;
    this.strikeEnergyLastUsedAt = 0;
  }

  takeDamage(amount) {
    if (this.isInvulnerable() || !this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true; // killed
    }
    return false;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      team: this.team,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: this.angle,
      hp: this.hp,
      alive: this.alive,
      state: this.state,
      invuln: this.isInvulnerable(),
      dashing: Date.now() < this.dashVisualUntil,
      dashCharges: this.dashCharges,
      dashRechargeAt: this.dashRechargeAt,
      strikeEnergy: Math.round(this.strikeEnergy),
      weapon: this.weapon,
      gunType: this.gunType,
      ability: this.ability,
      abilityCooldown: Math.max(0, this.abilityReadyAt - Date.now()),
      vx: Math.round(this.vx),
      vy: Math.round(this.vy),
    };
  }
}

module.exports = Player;
