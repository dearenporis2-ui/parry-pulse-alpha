// ============================================================================
// PARRY-PULSE — Server
// Serves the client statically and runs the authoritative game simulation
// over raw WebSockets (the `ws` package).
// ============================================================================

const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const C = require('./constants');
const GameRoom = require('./GameRoom');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = app.listen(PORT, () => {
  console.log(`\n  PARRY-PULSE server listening on http://localhost:${PORT}`);
  console.log(`  Open that URL in up to 4 browser tabs/windows to test 2v2.\n`);
});

const wss = new WebSocketServer({ server });

// Single fixed lobby for now (see GameRoom.js header comment for how to add
// room codes / multiple concurrent matches later).
const room = new GameRoom();

wss.on('connection', (ws) => {
  let player = null;

  if (room.isFull()) {
    ws.send(JSON.stringify({ type: 'full' }));
    ws.close();
    return;
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === 'join') {
      if (player) return; // already joined
      player = room.addPlayer(ws, sanitizeName(msg.name), sanitizeAbility(msg.ability));
      ws.send(JSON.stringify(room.serializeInitFor(player)));
      broadcast({ type: 'chat', text: `${player.name} joined Team ${player.team}` });
      return;
    }

    if (!player) return; // ignore anything before join

    switch (msg.type) {
      case 'input':
        room.handleInput(player, msg);
        break;
      case 'shoot':
        room.handleShoot(player, msg);
        break;
      case 'slash':
        room.handleSlash(player, msg);
        break;
      case 'dash':
        room.handleDash(player, msg);
        break;
      case 'dashStrike':
        room.handleDashStrike(player, msg);
        break;
      case 'weapon':
        room.handleWeapon(player, msg);
        break;
      case 'ability':
        room.handleAbility(player, msg);
        break;
      case 'restart':
        if (room.matchOver) room.restartMatch();
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (player) {
      room.removePlayer(player.id);
      broadcast({ type: 'left', playerId: player.id });
    }
  });
});

function sanitizeName(name) {
  if (typeof name !== 'string') return undefined;
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 16) || undefined;
}

function sanitizeAbility(ability) {
  return ability === 'pulse' ? 'pulse' : 'blink';
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}

// ----------------------------------------------------------------------
// Fixed-timestep game loop
// ----------------------------------------------------------------------
setInterval(() => {
  room.update();

  const events = room.flushEvents();
  if (events.length > 0) {
    broadcast({ type: 'events', events });
  }

  if (room.playerCount > 0) {
    broadcast(room.serializeState());
  }
}, 1000 / C.TICK_RATE);
