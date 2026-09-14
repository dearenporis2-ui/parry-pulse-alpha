// ============================================================================
// PARRY-PULSE — Asset Manager
//
// HOW TO ADD YOUR OWN ART/SFX LATER:
//   1. Drop your file into the matching folder under client/assets/...
//   2. Make sure the filename matches the `path` below for that key
//      (or edit the path here — this is the ONLY file you need to touch).
//   3. Reload the page. The renderer/audio code never changes: it just asks
//      AssetManager.getImage('player_A') / .getAudio('shoot') and
//      automatically gets your real asset instead of the procedural fallback.
//
// Nothing else in the codebase needs to know whether an asset is "real" or
// a placeholder — that's the entire point of this indirection layer.
// ============================================================================

const IMAGE_MANIFEST = {
  // key                path (relative to client/)                 expected size (for your reference)
  player_A: 'assets/sprites/characters/player_A.png',     // e.g. 64x64 spritesheet or single frame
  player_B: 'assets/sprites/characters/player_B.png',
  revolver: 'assets/sprites/weapons/revolver.png',
  pistol: 'assets/sprites/weapons/pistol.png',
  rifle: 'assets/sprites/weapons/rifle.png',
  katana: 'assets/sprites/weapons/katana.png',
  pistol_pickup: 'assets/sprites/weapons/pistol_pickup.png',
  rifle_pickup: 'assets/sprites/weapons/rifle_pickup.png',
  bullet: 'assets/sprites/bullets/bullet.png',
  bullet_super: 'assets/sprites/bullets/bullet_super.png',
  spark: 'assets/sprites/effects/spark.png',
  slash_fx: 'assets/sprites/effects/slash.png',
  arena_floor: 'assets/sprites/effects/arena_floor.png', // optional tiled background
};

const AUDIO_MANIFEST = {
  shoot: 'assets/audio/sfx/shoot.wav',
  slash: 'assets/audio/sfx/slash.wav',
  dash: 'assets/audio/sfx/dash.wav',
  dash_strike: 'assets/audio/sfx/dash_strike.wav',
  weapon_swap: 'assets/audio/sfx/weapon_swap.wav',
  pistol_shoot: 'assets/audio/sfx/pistol_shoot.wav',
  rifle_shoot: 'assets/audio/sfx/rifle_shoot.wav',
  gun_pickup: 'assets/audio/sfx/gun_pickup.wav',
  blink: 'assets/audio/sfx/blink.wav',
  pulse: 'assets/audio/sfx/pulse.wav',
  parry: 'assets/audio/sfx/parry.wav',
  supercharge: 'assets/audio/sfx/supercharge.wav',
  hit: 'assets/audio/sfx/hit.wav',
  kill: 'assets/audio/sfx/kill.wav',
  obstacle_hit: 'assets/audio/sfx/obstacle_hit.wav',
  round_start: 'assets/audio/sfx/round_start.wav',
  round_end: 'assets/audio/sfx/round_end.wav',
  match_end: 'assets/audio/sfx/match_end.wav',
};

class AssetManager {
  constructor() {
    this.images = new Map();   // key -> HTMLImageElement (only if it loaded)
    this.audioBuffers = new Map(); // key -> path (only if it loaded); actual decode lives in AudioManager
    this.ready = false;
  }

  /** Attempts to load every manifest entry. Missing files fail silently and
   *  simply leave that key absent — callers must handle a missing asset by
   *  falling back to procedural drawing/synth audio (see renderer.js / audioManager.js). */
  async loadAll() {
    const imagePromises = Object.entries(IMAGE_MANIFEST).map(([key, path]) =>
      this._tryLoadImage(key, path)
    );
    await Promise.all(imagePromises);
    this.ready = true;
  }

  _tryLoadImage(key, path) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(key, img);
        resolve();
      };
      img.onerror = () => resolve(); // silently skip — fallback shape will be used
      img.src = path;
    });
  }

  getImage(key) {
    return this.images.get(key) || null;
  }

  hasImage(key) {
    return this.images.has(key);
  }

  /** Returns the manifest path for a given audio key (used lazily by AudioManager,
   *  which does its own fetch+decode so it can also synthesize a fallback tone). */
  getAudioPath(key) {
    return AUDIO_MANIFEST[key] || null;
  }
}

export const assetManager = new AssetManager();
export { IMAGE_MANIFEST, AUDIO_MANIFEST };
