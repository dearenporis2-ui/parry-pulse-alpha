// ============================================================================
// PARRY-PULSE — Server Game Constants
// Tweak these to rebalance the game without touching logic code.
// ============================================================================

module.exports = {
  // --- Networking ---
  TICK_RATE: 30,                 // server simulation ticks per second
  STATE_BROADCAST_HZ: 30,        // how often full state snapshots are sent

  // --- Arena ---
  ARENA_WIDTH: 1600,
  ARENA_HEIGHT: 900,

  // Static cover rectangles {x, y, w, h}. Symmetrical so neither team is favored.
  OBSTACLES: [
    { x: 740, y: 90,  w: 120, h: 34 },   // top-mid cover
    { x: 740, y: 776, w: 120, h: 34 },   // bottom-mid cover
    { x: 420, y: 400, w: 34,  h: 100 },  // left-mid pillar
    { x: 1146, y: 400, w: 34, h: 100 }, // right-mid pillar
    { x: 760, y: 433, w: 80,  h: 34 },   // center box
  ],

  // --- Players ---
  PLAYER_RADIUS: 18,
  PLAYER_MAX_HP: 100,
  PLAYER_SPEED: 230,             // px/sec, normal movement
  PLAYER_SPEED_SWINGING: 170,    // px/sec, while katana active-window is out
  PLAYER_SPEED_RECOVERING: 90,   // px/sec, staggered after a missed parry
  PLAYER_ACCELERATION: 1450,     // responsive acceleration with a little weight
  PLAYER_BRAKE: 820,             // lower than acceleration for a controlled slide on release
  RESPAWN_INVULN_MS: 1200,       // brief invulnerability after round reset

  // --- Dash ---
  DASH_MAX_CHARGES: 3,
  DASH_DISTANCE: 185,            // px; collision is swept so dashes cannot pass through cover
  DASH_RECHARGE_MS: 5000,        // each spent charge returns independently after five seconds
  DASH_VISUAL_MS: 150,           // state/event lifetime for presentation only; dashes have no i-frames
  DASH_STRIKE_DISTANCE: 250,     // a blade lunge travels through enemies, but never through cover
  DASH_STRIKE_HIT_RADIUS: 34,    // sweep radius around the path; player radius makes the total hit width 52 px
  DASH_STRIKE_DAMAGE: 80,        // a clean dash strike leaves a wounded opponent
  DASH_STRIKE_ACTIVE_MS: 120,
  DASH_STRIKE_RECOVERY_MS: 420,  // missed dash strikes are deliberately committal
  DASH_STRIKE_PARRY_DAMAGE: 100, // a correctly timed parry defeats the attacker
  DASH_STRIKE_ENERGY_MAX: 100,
  DASH_STRIKE_ENERGY_COST: 34,
  DASH_STRIKE_ENERGY_REGEN_PER_SEC: 22,
  DASH_STRIKE_ENERGY_REGEN_DELAY_MS: 700,

  // --- Revolver ---
  SHOOT_COOLDOWN_MS: 350,
  BULLET_SPEED: 600,             // px/sec
  BULLET_RADIUS: 5,
  BULLET_DAMAGE: 50,             // 2 shots to kill normally
  BULLET_LIFETIME_MS: 4000,      // safety despawn if it never hits anything

  GUNS: {
    pistol: { cooldown: 310, speed: 620, damage: 50 },
    rifle: { cooldown: 115, speed: 810, damage: 28 },
  },
  GUN_PICKUP_MAX: 2,
  GUN_PICKUP_RESPAWN_MS: 8500,
  GUN_PICKUP_POINTS: [
    { x: 310, y: 185 }, { x: 310, y: 715 }, { x: 800, y: 250 },
    { x: 800, y: 650 }, { x: 1290, y: 185 }, { x: 1290, y: 715 },
  ],
  GUN_PICKUP_RADIUS: 34,

  // --- Katana / Deflection ---
  KATANA_RANGE: 48,              // px, true last-second deflection zone
  KATANA_ARC_DEG: 120,           // total arc width (degrees) centered on facing angle
  SWING_ACTIVE_MS: 140,          // window during which a parry can land
  SWING_RECOVERY_MS: 260,        // stagger duration after a MISSED parry
  SWING_SUCCESS_COOLDOWN_MS: 90, // short recovery after a SUCCESSFUL parry

  DEFLECT_SPEED_MULT: 2.0,       // enemy bullet parried -> 2x speed
  DEFLECT_DAMAGE: 100,           // one-shot kill on a clean parry
  SUPERCHARGE_SPEED_MULT: 2.6,   // teammate bullet parried -> supercharged
  SUPERCHARGE_DAMAGE: 100,

  BLINK_RANGE: 285,
  ABILITY_COOLDOWN_MS: 9000,
  PULSE_RADIUS: 170,
  PULSE_KNOCKBACK: 570,

  // --- Rounds / Match ---
  ROUNDS_TO_WIN: 3,
  ROUND_TIME_MS: 90000,          // soft timer; tiebreak by remaining team HP
  ROUND_RESTART_DELAY_MS: 3000,  // pause between rounds so players can read the banner

  // --- Teams ---
  TEAM_A: 'A',
  TEAM_B: 'B',
};
