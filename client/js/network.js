// ============================================================================
// PARRY-PULSE — Network Module
// Thin wrapper around a single WebSocket connection to the authoritative
// server. All game logic lives server-side; this just ships intent up and
// state down.
// ============================================================================

export class Network {
  constructor() {
    this.ws = null;
    this.handlers = {
      init: [], state: [], events: [], left: [], full: [], chat: [], open: [], close: [],
    };
  }

  connect(url) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this._emit('open');
    this.ws.onclose = () => this._emit('close');
    this.ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (e) {
        return;
      }
      this._emit(msg.type, msg);
    };
  }

  on(type, handler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  }

  _emit(type, msg) {
    (this.handlers[type] || []).forEach((h) => h(msg));
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  join(name, ability) {
    this._send({ type: 'join', name, ability });
  }

  sendInput(keys, angle) {
    this._send({ type: 'input', keys, angle });
  }

  sendShoot(angle) {
    this._send({ type: 'shoot', angle });
  }

  sendSlash(angle) {
    this._send({ type: 'slash', angle });
  }

  sendDash(angle) {
    this._send({ type: 'dash', angle });
  }

  sendDashStrike(angle) {
    this._send({ type: 'dashStrike', angle });
  }

  sendWeapon(weapon) {
    this._send({ type: 'weapon', weapon });
  }

  sendAbility(x, y) {
    this._send({ type: 'ability', x, y });
  }

  sendRestart() {
    this._send({ type: 'restart' });
  }
}
