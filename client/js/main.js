// ============================================================================
// PARRY-PULSE — Main
// Wires together Network, Input, Renderer, JuiceManager, AudioManager and
// AssetManager into a single game loop.
// ============================================================================

import { assetManager } from './assetManager.js';
import { audioManager } from './audioManager.js';
import { Network } from './network.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { JuiceManager } from './juiceManager.js';
import {
  TEAM_COLORS, INTERP_DELAY_MS, PLAYER_RADIUS,
  PLAYER_SPEED, PLAYER_SPEED_SWINGING, PLAYER_SPEED_RECOVERING,
  PLAYER_ACCELERATION, PLAYER_BRAKE, RECONCILE_SNAP_PX, RECONCILE_LERP,
} from './constants.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const joinScreen = document.getElementById('joinScreen');
const nameInput = document.getElementById('nameInput');
const joinButton = document.getElementById('joinButton');
const joinStatus = document.getElementById('joinStatus');
const gameContainer = document.getElementById('gameContainer');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');
const roundTimerEl = document.getElementById('roundTimer');
const bannerEl = document.getElementById('banner');
const restartPrompt = document.getElementById('restartPrompt');
const restartButton = document.getElementById('restartButton');
const connectionStatusEl = document.getElementById('connectionStatus');
const dashMeterEl = document.getElementById('dashMeter');
const strikeMeterEl = document.getElementById('strikeMeter');
const weaponModeEl = document.getElementById('weaponMode');
const abilityMeterEl = document.getElementById('abilityMeter');
const abilityChoices = [...document.querySelectorAll('.ability-choice')];

// ---------------------------------------------------------------------------
// Core systems
// ---------------------------------------------------------------------------
const network = new Network();
const juice = new JuiceManager();
const renderer = new Renderer(ctx, canvas.width, canvas.height);

let localPlayerId = null;
let localTeam = null;
let arena = null;
let input = null;

// Snapshot buffer for simple interpolation between 30Hz server ticks.
let prevSnapshot = null; // { t, players, bullets }
let curSnapshot = null;
let latestRound = { scoreA: 0, scoreB: 0, active: false, timeLeft: 0 };
let matchOver = false;
let selectedAbility = 'blink';

// ---------------------------------------------------------------------------
// Client-side prediction (local player only)
// The server is still fully authoritative — this just renders the local
// player's movement instantly instead of waiting for a round-trip, then
// quietly corrects toward whatever the server says actually happened.
// ---------------------------------------------------------------------------
let predicted = null; // { x, y, vx, vy }

function circleRectOverlap(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < radius * radius;
}

function collidesObstacle(x, y, radius) {
  if (!arena) return false;
  return arena.obstacles.some((rect) => circleRectOverlap(x, y, radius, rect));
}

function resolveCollision(nx, ny, ox, oy, radius) {
  return collidesObstacle(nx, ny, radius) ? { x: ox, y: oy } : { x: nx, y: ny };
}

function currentPredictedSpeed(state) {
  if (state === 'swinging') return PLAYER_SPEED_SWINGING;
  if (state === 'recovering') return PLAYER_SPEED_RECOVERING;
  return PLAYER_SPEED;
}

// Mirrors GameRoom._updatePlayers' movement math exactly (same accel/brake/
// collision), so predicted and authoritative positions rarely diverge.
function stepPrediction(dt) {
  if (!predicted || !input || !arena) return;

  let dx = 0, dy = 0;
  if (input.keys.up) dy -= 1;
  if (input.keys.down) dy += 1;
  if (input.keys.left) dx -= 1;
  if (input.keys.right) dx += 1;

  const localServerState = curSnapshot?.players.find((p) => p.id === localPlayerId)?.state || 'idle';
  const speed = currentPredictedSpeed(localServerState);

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    const targetX = (dx / len) * speed;
    const targetY = (dy / len) * speed;
    const step = PLAYER_ACCELERATION * dt;
    predicted.vx += Math.max(-step, Math.min(step, targetX - predicted.vx));
    predicted.vy += Math.max(-step, Math.min(step, targetY - predicted.vy));
  } else {
    const curSpeed = Math.hypot(predicted.vx, predicted.vy);
    const nextSpeed = Math.max(0, curSpeed - PLAYER_BRAKE * dt);
    if (curSpeed > 0) {
      predicted.vx *= nextSpeed / curSpeed;
      predicted.vy *= nextSpeed / curSpeed;
    }
  }

  const movedX = resolveCollision(predicted.x + predicted.vx * dt, predicted.y, predicted.x, predicted.y, PLAYER_RADIUS);
  if (movedX.x === predicted.x) predicted.vx = 0;
  predicted.x = movedX.x;
  const movedY = resolveCollision(predicted.x, predicted.y + predicted.vy * dt, predicted.x, predicted.y, PLAYER_RADIUS);
  if (movedY.y === predicted.y) predicted.vy = 0;
  predicted.y = movedY.y;

  predicted.x = Math.max(PLAYER_RADIUS, Math.min(arena.width - PLAYER_RADIUS, predicted.x));
  predicted.y = Math.max(PLAYER_RADIUS, Math.min(arena.height - PLAYER_RADIUS, predicted.y));
}

// Small drift gets smoothly nudged away each server update; large gaps
// (dash, dash strike, blink, knockback) snap instantly so movement never
// looks like it's fighting itself.
function reconcilePredicted(serverPlayer) {
  if (!serverPlayer) return;
  if (!predicted) {
    predicted = { x: serverPlayer.x, y: serverPlayer.y, vx: 0, vy: 0 };
    return;
  }
  const gap = Math.hypot(serverPlayer.x - predicted.x, serverPlayer.y - predicted.y);
  if (gap > RECONCILE_SNAP_PX) {
    predicted.x = serverPlayer.x;
    predicted.y = serverPlayer.y;
    predicted.vx = serverPlayer.vx || 0;
    predicted.vy = serverPlayer.vy || 0;
  } else {
    predicted.x += (serverPlayer.x - predicted.x) * RECONCILE_LERP;
    predicted.y += (serverPlayer.y - predicted.y) * RECONCILE_LERP;
  }
}

abilityChoices.forEach((button) => button.addEventListener('click', () => {
  selectedAbility = button.dataset.ability;
  abilityChoices.forEach((choice) => choice.classList.toggle('selected', choice === button));
}));

// ---------------------------------------------------------------------------
// Join flow
// ---------------------------------------------------------------------------
function tryJoin() {
  const name = nameInput.value.trim() || 'Player';
  joinStatus.textContent = 'Connecting...';
  joinButton.disabled = true;

  audioManager.unlock(); // must happen on a user gesture

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  network.connect(`${proto}://${location.host}`);

  network.on('open', () => {
    network.join(name, selectedAbility);
  });

  network.on('full', () => {
    joinStatus.textContent = 'Lobby is full (4/4 players). Try again shortly.';
    joinButton.disabled = false;
  });

  network.on('close', () => {
    connectionStatusEl.textContent = 'Disconnected from server.';
  });
}

joinButton.addEventListener('click', tryJoin);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryJoin();
});

// ---------------------------------------------------------------------------
// Network handlers
// ---------------------------------------------------------------------------
network.on('init', (msg) => {
  localPlayerId = msg.playerId;
  localTeam = msg.team;
  arena = msg.arena;

  joinScreen.classList.add('hidden');
  gameContainer.classList.remove('hidden');
  connectionStatusEl.textContent = `Connected — Team ${localTeam}`;

  input = new Input(canvas, network, getLocalScreenPos, updateWeaponMode);

  assetManager.loadAll(); // fire-and-forget; renderer falls back gracefully until ready

  requestAnimationFrame(loop);
});

network.on('state', (msg) => {
  prevSnapshot = curSnapshot;
  curSnapshot = { t: performance.now(), serverT: msg.t, players: msg.players, bullets: msg.bullets, gunPickups: msg.gunPickups || [] };
  latestRound = msg.round;
  matchOver = msg.matchOver;

  scoreAEl.textContent = latestRound.scoreA;
  scoreBEl.textContent = latestRound.scoreB;
  roundTimerEl.textContent = Math.ceil(latestRound.timeLeft / 1000);
  const localPlayerState = msg.players.find((p) => p.id === localPlayerId);
  reconcilePredicted(localPlayerState);
  updateDashMeter(localPlayerState);
  updateStrikeMeter(localPlayerState);
  updateAbilityMeter(localPlayerState);
  if (input && localPlayerState) input.syncWeapon(localPlayerState.weapon);

  if (matchOver) {
    restartPrompt.classList.remove('hidden');
  }
});

network.on('events', (msg) => {
  for (const evt of msg.events) handleEvent(evt);
});

restartButton.addEventListener('click', () => {
  network.sendRestart();
  restartPrompt.classList.add('hidden');
});

// ---------------------------------------------------------------------------
// Juice + audio reactions to gameplay events
// ---------------------------------------------------------------------------
function handleEvent(evt) {
  switch (evt.kind) {
    case 'shoot':
      audioManager.play(evt.gunType === 'rifle' ? 'rifle_shoot' : 'pistol_shoot', { volume: 0.75 });
      juice.particles.burst(evt.x, evt.y, TEAM_COLORS[evt.team].bright, 4, { speedMin: 20, speedMax: 80, life: 0.15, size: 2 });
      break;

    case 'slash':
      renderer.triggerSwingAnim(evt.playerId, evt.angle, evt.team);
      audioManager.play('slash', { volume: 0.8 });
      break;

    case 'parry': {
      const color = evt.supercharged ? '#ffd23f' : '#ffffff';
      juice.hitStop(evt.supercharged ? 5 : 4);
      juice.shake(evt.supercharged ? 18 : 12, 0.25);
      juice.flash(color, evt.supercharged ? 0.18 : 0.12);
      juice.particles.burst(evt.x, evt.y, color, evt.supercharged ? 28 : 18, { speedMax: 320 });
      audioManager.play(evt.supercharged ? 'supercharge' : 'parry', { volume: 1 });
      break;
    }

    case 'dash': {
      const color = TEAM_COLORS[evt.team].bright;
      juice.shake(5, 0.12);
      juice.particles.dashTrail(evt.x, evt.y, evt.toX, evt.toY, color);
      juice.particles.burst(evt.x, evt.y, color, 10, { speedMin: 70, speedMax: 180, life: 0.25, size: 2 });
      audioManager.play('dash', { volume: 0.55 });
      break;
    }

    case 'dashStrike': {
      const color = TEAM_COLORS[evt.team].bright;
      renderer.triggerDashStrikeAnim(evt.playerId, evt.angle, evt.team);
      juice.hitStop(2);
      juice.shake(9, 0.16);
      juice.particles.dashTrail(evt.x, evt.y, evt.toX, evt.toY, color);
      juice.particles.burst(evt.toX, evt.toY, color, 20, { speedMin: 80, speedMax: 260, life: 0.32, size: 3 });
      audioManager.play('dash_strike', { volume: 1 });
      break;
    }

    case 'dashStrikeHit':
      juice.hitStop(3); juice.shake(13, 0.22); juice.flash('#ff8a8a', 0.08);
      juice.particles.burst(evt.x, evt.y, '#ff8a8a', 24, { speedMax: 320, life: 0.45 });
      audioManager.play('hit', { volume: 1 });
      break;

    case 'dashParried':
      juice.hitStop(5); juice.shake(22, 0.32); juice.flash('#ffffff', 0.16);
      juice.particles.burst(evt.x, evt.y, '#ffffff', 40, { speedMax: 420, life: 0.55 });
      audioManager.play('parry', { volume: 1 });
      break;

    case 'gunSpawn':
      juice.particles.burst(evt.x, evt.y, evt.type === 'rifle' ? '#a78bfa' : '#3fd0ff', 16, { speedMax: 180, life: 0.4 });
      break;

    case 'gunPickup':
      juice.shake(7, 0.15);
      juice.particles.burst(evt.x, evt.y, evt.type === 'rifle' ? '#a78bfa' : '#3fd0ff', 22, { speedMax: 230, life: 0.42 });
      audioManager.play('gun_pickup', { volume: 0.8 });
      break;

    case 'blink':
      juice.particles.dashTrail(evt.x, evt.y, evt.toX, evt.toY, TEAM_COLORS[evt.team].bright);
      juice.flash(TEAM_COLORS[evt.team].bright, 0.08);
      audioManager.play('blink', { volume: 0.85 });
      break;

    case 'pulse':
      juice.shake(16, 0.26);
      juice.flash('#c4b5fd', 0.12);
      juice.particles.burst(evt.x, evt.y, '#c4b5fd', 34, { speedMax: 360, life: 0.55 });
      audioManager.play('pulse', { volume: 0.95 });
      break;

    case 'hit':
      juice.shake(4, 0.1);
      juice.particles.burst(evt.x, evt.y, TEAM_COLORS[evt.team].main, 10);
      audioManager.play('hit', { volume: 0.8 });
      break;

    case 'kill':
      juice.deathCinematic(evt.x, evt.y);
      juice.flash('#ff4d4d', 0.15);
      juice.particles.burst(evt.x, evt.y, '#ff4d4d', 64, { speedMax: 440, life: 0.9, size: 4 });
      audioManager.play('kill', { volume: 1 });
      break;

    case 'obstacleHit':
      juice.particles.burst(evt.x, evt.y, '#9aa4b2', 8, { speedMax: 150, life: 0.25 });
      audioManager.play('obstacle_hit', { volume: 0.6 });
      break;

    case 'roundStart':
      showBanner(`ROUND START`, '#3fd0ff');
      audioManager.play('round_start', { volume: 0.7 });
      break;

    case 'roundEnd':
      showBanner(`TEAM ${evt.winner} WINS THE ROUND`, evt.winner === 'A' ? '#3fd0ff' : '#ff5b6e');
      audioManager.play('round_end', { volume: 0.8 });
      break;

    case 'roundDraw':
      showBanner(`ROUND DRAW — REPLAYING`, '#94a3b8');
      break;

    case 'matchEnd':
      showBanner(`TEAM ${evt.winner} WINS THE MATCH!`, evt.winner === 'A' ? '#3fd0ff' : '#ff5b6e', 3000);
      audioManager.play('match_end', { volume: 1 });
      break;

    default:
      break;
  }
}

function updateDashMeter(player) {
  if (!player) return;
  const now = Date.now();
  const slots = Array.from({ length: 3 }, (_, index) => {
    if (index < player.dashCharges) return '<span class="dash-charge ready"></span>';
    const readyAt = player.dashRechargeAt?.[index - player.dashCharges];
    const seconds = readyAt ? Math.max(0, Math.ceil((readyAt - now) / 1000)) : 5;
    return `<span class="dash-charge cooling">${seconds}</span>`;
  });
  dashMeterEl.innerHTML = `<span class="dash-label">DASH</span>${slots.join('')}`;
}

function updateWeaponMode(weapon) {
  const sword = weapon === 'sword';
  weaponModeEl.textContent = sword ? 'KATANA · LEFT CLICK: DASH STRIKE' : 'REVOLVER · LEFT CLICK: FIRE';
  weaponModeEl.classList.toggle('sword', sword);
  weaponModeEl.classList.toggle('revolver', !sword);
  audioManager.play('weapon_swap', { volume: 0.55 });
}

function updateStrikeMeter(player) {
  if (!player) return;
  const energy = player.strikeEnergy ?? 100;
  strikeMeterEl.innerHTML = `<span class="strike-label">BLADE ENERGY</span><span class="strike-track"><span class="strike-fill" style="width:${energy}%"></span></span><span class="strike-value">${energy}</span>`;
}

function updateAbilityMeter(player) {
  if (!player) return;
  const seconds = Math.ceil((player.abilityCooldown || 0) / 1000);
  const name = player.ability === 'pulse' ? 'KINETIC PULSE' : 'BLINK';
  abilityMeterEl.textContent = seconds ? `${name} · E · ${seconds}s` : `${name} · E · READY`;
  abilityMeterEl.classList.toggle('ready', !seconds);
}

let bannerTimeout = null;
function showBanner(text, color, duration = 1600) {
  bannerEl.textContent = text;
  bannerEl.style.color = color;
  bannerEl.classList.remove('hidden');
  // restart the CSS pop animation
  bannerEl.style.animation = 'none';
  void bannerEl.offsetWidth;
  bannerEl.style.animation = '';

  if (bannerTimeout) clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => bannerEl.classList.add('hidden'), duration);
}

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------
function getInterpolatedState() {
  if (!curSnapshot) return { players: [], bullets: [], gunPickups: [] };
  if (!prevSnapshot) return { players: curSnapshot.players, bullets: curSnapshot.bullets, gunPickups: curSnapshot.gunPickups };

  const renderTime = performance.now() - INTERP_DELAY_MS;
  const span = curSnapshot.t - prevSnapshot.t || 1;
  let t = (renderTime - prevSnapshot.t) / span;
  t = Math.max(0, Math.min(1, t));

  const players = curSnapshot.players.map((cp) => {
    const pp = prevSnapshot.players.find((p) => p.id === cp.id);
    if (!pp) return cp;
    return {
      ...cp,
      x: pp.x + (cp.x - pp.x) * t,
      y: pp.y + (cp.y - pp.y) * t,
      angle: cp.angle, // angle snaps instantly (aiming should feel immediate)
    };
  });

  const bullets = curSnapshot.bullets.map((cb) => {
    const pb = prevSnapshot.bullets.find((b) => b.id === cb.id);
    if (!pb) return cb;
    return { ...cb, x: pb.x + (cb.x - pb.x) * t, y: pb.y + (cb.y - pb.y) * t };
  });

  return { players, bullets, gunPickups: curSnapshot.gunPickups };
}

function getLocalScreenPos() {
  if (predicted) return { x: predicted.x, y: predicted.y };
  if (!curSnapshot) return null;
  const p = curSnapshot.players.find((p) => p.id === localPlayerId);
  return p ? { x: p.x, y: p.y } : null;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let lastFrameTime = performance.now();
let dustTimer = 0;

function loop(now) {
  requestAnimationFrame(loop);

  // Hit-stop: if active, completely skip this frame (no update, no redraw).
  if (juice.consumeHitStop()) return;

  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  if (input) input.tick(now);
  juice.update(dt);
  stepPrediction(dt);

  const { players, bullets, gunPickups } = getInterpolatedState();

  // Local player renders at its predicted (instant-feeling) position rather
  // than the interpolated/delayed server one; everyone else is unaffected.
  if (predicted) {
    const localIndex = players.findIndex((p) => p.id === localPlayerId);
    if (localIndex >= 0) {
      players[localIndex] = { ...players[localIndex], x: predicted.x, y: predicted.y };
    }
  }

  // Cheap cosmetic dust puffs under the local player while moving.
  const localPlayer = players.find((p) => p.id === localPlayerId);
  if (localPlayer && input) {
    const moving = input.keys.up || input.keys.down || input.keys.left || input.keys.right;
    dustTimer -= dt;
    if (moving && localPlayer.alive && dustTimer <= 0) {
      dustTimer = 0.08;
      juice.particles.dust(localPlayer.x, localPlayer.y + 14, 'rgba(200,200,200,0.5)');
    }
  }

  draw(players, bullets, gunPickups, now);
}

function draw(players, bullets, gunPickups, now) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  juice.applyCamera(ctx, canvas.width, canvas.height);

  if (arena) {
    renderer.drawBackground(arena);
    renderer.drawObstacles(arena.obstacles);
  }

  for (const p of players) {
    renderer.drawPlayer(p, p.id === localPlayerId, now);
  }
  for (const b of bullets) {
    renderer.drawBullet(b);
  }
  for (const pickup of gunPickups) renderer.drawGunPickup(pickup, now);

  juice.particles.draw(ctx);

  ctx.restore();
  juice.drawFlash(ctx, canvas.width, canvas.height);
}