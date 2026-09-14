// ============================================================================
// PARRY-PULSE — Renderer
//
// Every draw function here first checks AssetManager for a real sprite via
// `assetManager.getImage(key)`. If present, it draws the image (rotated to
// match facing angle where relevant). If absent, it falls back to a simple
// procedural shape. This means dropping in Aseprite exports later requires
// ZERO changes to this file — just add the file under client/assets/... with
// the right name (see assetManager.js's IMAGE_MANIFEST).
// ============================================================================

import { assetManager } from './assetManager.js';
import { TEAM_COLORS, PLAYER_RADIUS, BULLET_RADIUS, KATANA_RANGE, KATANA_ARC_DEG, COLORS } from './constants.js';

const SWING_ANIM_MS = 400; // purely cosmetic local animation duration, independent of server timing

export class Renderer {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.localSwingAnims = new Map(); // playerId -> { startTime, angle, team }
  }

  /** Call when a 'slash' event arrives so we can animate the swing locally. */
  triggerSwingAnim(playerId, angle, team) {
    this.localSwingAnims.set(playerId, { startTime: performance.now(), angle, team });
  }

  triggerDashStrikeAnim(playerId, angle, team) {
    this.localSwingAnims.set(playerId, { startTime: performance.now(), angle, team, strike: true });
  }

  drawBackground(arena) {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, arena.width, arena.height);

    const floorImg = assetManager.getImage('arena_floor');
    if (floorImg) {
      ctx.drawImage(floorImg, 0, 0, arena.width, arena.height);
      return;
    }

    // Procedural grid fallback
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x <= arena.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, arena.height);
      ctx.stroke();
    }
    for (let y = 0; y <= arena.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(arena.width, y);
      ctx.stroke();
    }

    // Center line to make the 2v2 symmetry readable
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arena.width / 2, 0);
    ctx.lineTo(arena.width / 2, arena.height);
    ctx.stroke();
  }

  drawObstacles(obstacles) {
    const ctx = this.ctx;
    for (const rect of obstacles) {
      ctx.fillStyle = COLORS.obstacle;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = COLORS.obstacleEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  drawPlayer(player, isLocal, now) {
    const ctx = this.ctx;
    const colors = TEAM_COLORS[player.team];
    const spriteKey = player.team === 'A' ? 'player_A' : 'player_B';
    const img = assetManager.getImage(spriteKey);

    ctx.save();
    ctx.translate(player.x, player.y);

    // Invulnerability shimmer (post-respawn)
    if (player.invuln) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 60);
    }

    if (!player.alive) {
      ctx.globalAlpha = 0.25;
    }

    if (player.dashing) {
      const pulse = 1 + 0.14 * Math.sin(now / 18);
      ctx.strokeStyle = colors.bright;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, (PLAYER_RADIUS + 8) * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (img) {
      ctx.save();
      ctx.rotate(player.angle);
      ctx.drawImage(img, -PLAYER_RADIUS, -PLAYER_RADIUS, PLAYER_RADIUS * 2, PLAYER_RADIUS * 2);
      ctx.restore();
    } else {
      // Procedural fallback: body circle + facing wedge "nose"
      let bodyColor = colors.main;
      if (player.state === 'recovering') bodyColor = '#8b8b8b'; // staggered / vulnerable tint
      else if (player.state === 'swinging') bodyColor = colors.bright;

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isLocal ? '#ffffff' : colors.dark;
      ctx.lineWidth = isLocal ? 3 : 2;
      ctx.stroke();

      // Facing indicator (nose wedge)
      ctx.save();
      ctx.rotate(player.angle);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(PLAYER_RADIUS - 4, 0);
      ctx.lineTo(PLAYER_RADIUS - 12, -6);
      ctx.lineTo(PLAYER_RADIUS - 12, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (player.state === 'recovering') {
        // Stagger indicator: dashed ring
        ctx.strokeStyle = 'rgba(255,80,80,0.8)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, PLAYER_RADIUS + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // The katana is always readable, even before a custom weapon sprite exists.
    ctx.save();
    ctx.rotate(player.angle);
    const katana = assetManager.getImage('katana');
    if (katana) {
      ctx.drawImage(katana, -4, -10, 76, 20);
    } else {
      ctx.strokeStyle = '#eef7ff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(5, -7);
      ctx.lineTo(62, -7);
      ctx.stroke();
      ctx.strokeStyle = '#f2bf55';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 1);
      ctx.stroke();
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-13, -7);
      ctx.lineTo(2, -7);
      ctx.stroke();
    }
    ctx.restore();

    // Weapon in hand communicates the selected combat mode to every player.
    if (player.weapon === 'revolver') {
      ctx.save();
      ctx.rotate(player.angle);
      const revolver = assetManager.getImage(player.gunType || 'revolver');
      if (revolver) {
        ctx.drawImage(revolver, 2, -10, 42, 20);
      } else {
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(4, -6, 27, 12);
        ctx.fillStyle = '#111827';
        ctx.fillRect(28, -3, 18, 6);
        ctx.strokeStyle = '#b8c5d6';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, -6, 27, 12);
      }
      ctx.restore();
    }

    ctx.restore();

    // Name + HP bar (drawn unrotated, above the player)
    ctx.save();
    ctx.globalAlpha = player.alive ? 1 : 0.3;
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(player.name, player.x, player.y - PLAYER_RADIUS - 18);

    const barW = 34, barH = 4;
    const hpRatio = Math.max(0, player.hp / 100);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(player.x - barW / 2, player.y - PLAYER_RADIUS - 13, barW, barH);
    ctx.fillStyle = hpRatio > 0.5 ? COLORS.hpGood : hpRatio > 0.25 ? COLORS.hpMid : COLORS.hpLow;
    ctx.fillRect(player.x - barW / 2, player.y - PLAYER_RADIUS - 13, barW * hpRatio, barH);
    ctx.restore();

    this.drawSwingArcAt(player.id, player.x, player.y, now);
  }

  /** Draws the katana arc for a given (possibly-moving) player position. */
  drawSwingArcAt(playerId, x, y, now) {
    const anim = this.localSwingAnims.get(playerId);
    if (!anim) return;
    const elapsed = now - anim.startTime;
    if (elapsed > SWING_ANIM_MS) {
      this.localSwingAnims.delete(playerId);
      return;
    }
    const ctx = this.ctx;
    const t = elapsed / SWING_ANIM_MS;
    const colors = TEAM_COLORS[anim.team];
    const halfArc = ((anim.strike ? 105 : KATANA_ARC_DEG) * Math.PI / 180) / 2;
    const range = anim.strike ? 92 : KATANA_RANGE;
    const fade = Math.max(0, 1 - t);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(anim.angle);
    ctx.globalAlpha = fade * 0.8;
    ctx.strokeStyle = colors.bright;
    ctx.lineWidth = anim.strike ? 8 : 4;
    ctx.beginPath();
    ctx.arc(0, 0, range, -halfArc, halfArc);
    ctx.stroke();

    ctx.globalAlpha = fade * 0.18;
    ctx.fillStyle = colors.bright;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, -halfArc, halfArc);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawBullet(bullet) {
    const ctx = this.ctx;
    const img = assetManager.getImage(bullet.supercharged ? 'bullet_super' : 'bullet');
    const color = bullet.supercharged ? COLORS.supercharged : TEAM_COLORS[bullet.team].main;

    if (img) {
      ctx.save();
      ctx.translate(bullet.x, bullet.y);
      ctx.rotate(bullet.angle);
      const size = BULLET_RADIUS * 2.5;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }

    // Procedural fallback: glowing dot with a short motion trail
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = bullet.supercharged ? 14 : 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.supercharged ? BULLET_RADIUS * 1.4 : BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const trailLen = bullet.supercharged ? 22 : 14;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(bullet.x - Math.cos(bullet.angle) * trailLen, bullet.y - Math.sin(bullet.angle) * trailLen);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawGunPickup(pickup, now) {
    const ctx = this.ctx;
    const color = pickup.type === 'rifle' ? '#a78bfa' : '#3fd0ff';
    const img = assetManager.getImage(`${pickup.type}_pickup`) || assetManager.getImage(pickup.type);
    const bob = Math.sin(now / 180 + pickup.id) * 4;
    ctx.save();
    ctx.translate(pickup.x, pickup.y + bob);
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (img) ctx.drawImage(img, -24, -12, 48, 24);
    else {
      ctx.fillStyle = pickup.type === 'rifle' ? '#8b5cf6' : '#38bdf8';
      ctx.fillRect(-18, -5, pickup.type === 'rifle' ? 38 : 26, 10);
      ctx.fillStyle = '#101827';
      ctx.fillRect(8, 3, 8, 10);
    }
    ctx.restore();
  }
}
