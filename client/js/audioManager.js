// ============================================================================
// PARRY-PULSE — Audio Manager
//
// Drop a real .wav/.mp3 into client/assets/audio/sfx/ matching the filenames
// in assetManager.js's AUDIO_MANIFEST and it will automatically be used
// instead of the synthesized placeholder tone below. No code changes needed.
// ============================================================================

import { assetManager } from './assetManager.js';

// Placeholder synth "personality" per sound key, used only when no real file exists.
const SYNTH_PRESETS = {
  shoot:        { type: 'square',   freq: 620, endFreq: 180, duration: 0.09, gain: 0.18 },
  slash:        { type: 'sawtooth', freq: 300, endFreq: 900, duration: 0.10, gain: 0.15 },
  dash:         { type: 'sawtooth', freq: 130, endFreq: 560, duration: 0.12, gain: 0.12 },
  dash_strike:  { type: 'sawtooth', freq: 200, endFreq: 1100, duration: 0.18, gain: 0.2 },
  weapon_swap:  { type: 'triangle', freq: 540, endFreq: 780, duration: 0.07, gain: 0.1 },
  pistol_shoot: { type: 'square', freq: 650, endFreq: 150, duration: 0.08, gain: 0.18 },
  rifle_shoot:  { type: 'sawtooth', freq: 380, endFreq: 90, duration: 0.07, gain: 0.15 },
  gun_pickup:   { type: 'triangle', freq: 470, endFreq: 980, duration: 0.15, gain: 0.16 },
  blink:        { type: 'sine', freq: 900, endFreq: 240, duration: 0.2, gain: 0.18 },
  pulse:        { type: 'sine', freq: 90, endFreq: 35, duration: 0.35, gain: 0.32 },
  parry:        { type: 'triangle', freq: 1200, endFreq: 300, duration: 0.16, gain: 0.30, metallic: true },
  supercharge:  { type: 'triangle', freq: 1600, endFreq: 400, duration: 0.22, gain: 0.35, metallic: true },
  hit:          { type: 'sine',     freq: 160, endFreq: 60,  duration: 0.14, gain: 0.28 },
  kill:         { type: 'sine',     freq: 100, endFreq: 40,  duration: 0.35, gain: 0.4 },
  obstacle_hit: { type: 'square',   freq: 200, endFreq: 100, duration: 0.06, gain: 0.12 },
  round_start:  { type: 'triangle', freq: 440, endFreq: 880, duration: 0.30, gain: 0.25 },
  round_end:    { type: 'triangle', freq: 660, endFreq: 220, duration: 0.40, gain: 0.3 },
  match_end:    { type: 'triangle', freq: 880, endFreq: 220, duration: 0.6, gain: 0.35 },
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = new Map(); // key -> decoded AudioBuffer (real files only)
    this.masterGain = null;
    this.muted = false;
  }

  /** Must be called after a user gesture (browser autoplay policy). */
  async unlock() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);
    await this._preloadRealFiles();
  }

  async _preloadRealFiles() {
    const keys = ['shoot', 'slash', 'dash', 'dash_strike', 'weapon_swap', 'pistol_shoot', 'rifle_shoot', 'gun_pickup', 'blink', 'pulse', 'parry', 'supercharge', 'hit', 'kill', 'obstacle_hit', 'round_start', 'round_end', 'match_end'];
    await Promise.all(keys.map(async (key) => {
      const path = assetManager.getAudioPath(key);
      if (!path) return;
      try {
        const res = await fetch(path);
        if (!res.ok) return;
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(key, audioBuffer);
      } catch (e) {
        // No file yet (404) or bad format — fine, synth fallback covers it.
      }
    }));
  }

  play(key, { volume = 1 } = {}) {
    if (!this.ctx || this.muted) return;

    const realBuffer = this.buffers.get(key);
    if (realBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = realBuffer;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.masterGain);
      src.start();
      return;
    }

    this._playSynth(key, volume);
  }

  _playSynth(key, volume) {
    const preset = SYNTH_PRESETS[key];
    if (!preset) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = preset.type;
    osc.frequency.setValueAtTime(preset.freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, preset.endFreq), now + preset.duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(preset.gain * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + preset.duration);

    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + preset.duration + 0.02);

    // "metallic" presets (parry/supercharge) layer a short burst of filtered
    // noise on top of the tone to fake a clang rather than a pure beep.
    if (preset.metallic) {
      const bufferSize = this.ctx.sampleRate * preset.duration;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2500;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = preset.gain * 0.6 * volume;

      noise.connect(filter).connect(noiseGain).connect(this.masterGain);
      noise.start(now);
    }
  }

  setMuted(muted) {
    this.muted = muted;
  }
}

export const audioManager = new AudioManager();
