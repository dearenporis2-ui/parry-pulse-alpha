// ============================================================================
// PARRY-PULSE — Input Module
// Captures WASD + mouse, computes an aim angle from the local player's last
// known screen position to the cursor, and forwards intent to the server.
// The server is authoritative — this never moves the player directly.
// ============================================================================

// Matched on e.key (the character actually printed on the keycap / produced
// by the layout) rather than e.code (physical position). This means both
// QWERTY players (WASD) and AZERTY players (ZQSD) get correct movement
// without needing separate handling, and arrow keys always work too.
const KEY_MAP = {
  w: 'up', z: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down',
  a: 'left', q: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
};

export class Input {
  constructor(canvas, network, getLocalScreenPos, onWeaponChange) {
    this.canvas = canvas;
    this.network = network;
    this.getLocalScreenPos = getLocalScreenPos; // () => {x, y} in canvas space
    this.keys = { up: false, down: false, left: false, right: false };
    this.mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    this.angle = 0;
    this.weapon = 'sword';
    this.onWeaponChange = onWeaponChange;
    this._lastSentKeys = null;
    this._lastSentAngleTime = 0;

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight' && e.code !== 'Space')) return;
      e.preventDefault();
      this._dash();
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      // Canvas internal resolution (e.g. 1600x900) may differ from its
      // displayed CSS size, so scale the cursor position into world space.
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === '1') this._setWeapon('revolver');
      if (e.key === '2') this._setWeapon('sword');
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); this._useAbility(); }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._setWeapon(this.weapon === 'sword' ? 'revolver' : 'sword');
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) (this.weapon === 'sword' ? this._fireDashStrike() : this._fireShoot());
      if (e.button === 2 && this.weapon === 'sword') this._fireSlash();
    });

    // Right-click must not open the context menu.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _onKey(e, isDown) {
    const action = KEY_MAP[e.key.toLowerCase()];
    if (!action) return;
    this.keys[action] = isDown;
    e.preventDefault();
  }

  _computeAngle() {
    const pos = this.getLocalScreenPos();
    if (!pos) return this.angle;
    this.angle = Math.atan2(this.mouse.y - pos.y, this.mouse.x - pos.x);
    return this.angle;
  }

  _fireShoot() {
    this.network.sendShoot(this._computeAngle());
  }

  _fireSlash() {
    this.network.sendSlash(this._computeAngle());
  }

  _dash() {
    // Movement input takes priority; otherwise dash toward the reticle.
    let x = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let y = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
    const angle = (x || y) ? Math.atan2(y, x) : this._computeAngle();
    this.network.sendDash(angle);
  }

  _fireDashStrike() {
    this.network.sendDashStrike(this._computeAngle());
  }

  _setWeapon(weapon) {
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    this.network.sendWeapon(weapon);
    this.onWeaponChange?.(weapon);
  }

  syncWeapon(weapon) {
    if ((weapon === 'sword' || weapon === 'revolver') && weapon !== this.weapon) {
      this.weapon = weapon;
      this.onWeaponChange?.(weapon);
    }
  }

  _useAbility() {
    this.network.sendAbility(this.mouse.x, this.mouse.y);
  }

  /** Call once per frame from the main loop. Sends input at a throttled rate
   *  (movement keys immediately on change, aim angle ~20Hz). */
  tick(now) {
    const angle = this._computeAngle();

    const keysChanged = !this._lastSentKeys ||
      this._lastSentKeys.up !== this.keys.up ||
      this._lastSentKeys.down !== this.keys.down ||
      this._lastSentKeys.left !== this.keys.left ||
      this._lastSentKeys.right !== this.keys.right;

    const angleDue = now - this._lastSentAngleTime > 50; // 20Hz

    if (keysChanged || angleDue) {
      this.network.sendInput({ ...this.keys }, angle);
      this._lastSentKeys = { ...this.keys };
      this._lastSentAngleTime = now;
    }
  }
}
