// ============================================================================
// PARRY-PULSE — Client Constants
// Purely cosmetic/UI values. All gameplay-affecting numbers (speed, damage,
// timers) live on the server (server/constants.js) and arrive via network
// messages — the client never needs to know them to render correctly.
// ============================================================================

export const TEAM_COLORS = {
  A: { main: '#3fd0ff', dark: '#0f4a5c', bright: '#c9f7ff' },
  B: { main: '#ff5b6e', dark: '#5c1420', bright: '#ffd4d8' },
};

export const PLAYER_RADIUS = 18;       // must visually match server.PLAYER_RADIUS
export const BULLET_RADIUS = 5;        // must visually match server.BULLET_RADIUS
export const KATANA_RANGE = 48;        // for drawing the swing arc, matches server
export const KATANA_ARC_DEG = 120;

export const INTERP_DELAY_MS = 80;     // render this far in the past for smooth interpolation

// --- Client-side prediction ---
// These must match server/constants.js exactly, or the local player will
// visibly drift from the authoritative position and get corrected/snapped.
export const PLAYER_SPEED = 230;
export const PLAYER_SPEED_SWINGING = 170;
export const PLAYER_SPEED_RECOVERING = 90;
export const PLAYER_ACCELERATION = 1450;
export const PLAYER_BRAKE = 820;

export const RECONCILE_SNAP_PX = 60;   // server/predicted gap bigger than this = teleport, snap instantly
export const RECONCILE_LERP = 0.18;    // otherwise, correct this fraction of the gap per server update

export const COLORS = {
  bg: '#0b0e14',
  grid: '#141a24',
  obstacle: '#2a3140',
  obstacleEdge: '#4a5568',
  supercharged: '#ffd23f',
  hpGood: '#3fe07a',
  hpMid: '#ffcc3f',
  hpLow: '#ff4d4d',
  invuln: 'rgba(255,255,255,0.55)',
};