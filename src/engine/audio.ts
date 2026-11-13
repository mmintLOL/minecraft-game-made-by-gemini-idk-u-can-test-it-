import { SoundCategory } from './blocks';

class VoxelAudio {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const len = this.ctx.sampleRate * 0.4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  public playBreak(cat: SoundCategory) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    const pitchScale = 0.88 + Math.random() * 0.24;

    if (cat === 'glass' || cat === 'crystal') {
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1800 * pitchScale, now);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      // Crystal chime harmonic
      if (cat === 'crystal') {
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1120 * pitchScale, now);
        osc.frequency.exponentialRampToValueAtTime(640 * pitchScale, now + 0.16);
        og.gain.setValueAtTime(0.08, now);
        og.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(og).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
      }
    } else if (cat === 'stone') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420 * pitchScale, now);
      filter.Q.value = 1.4;
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    } else if (cat === 'wood') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(560 * pitchScale, now);
      filter.Q.value = 2.2;
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950 * pitchScale, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    }

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.16);
  }

  public playPlace(cat: SoundCategory) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pitchScale = 0.92 + Math.random() * 0.16;

    if (cat === 'crystal' || cat === 'glass') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760 * pitchScale, now);
      osc.frequency.exponentialRampToValueAtTime(480 * pitchScale, now + 0.09);
      gain.gain.setValueAtTime(0.09, now);
    } else if (cat === 'wood') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280 * pitchScale, now);
      osc.frequency.exponentialRampToValueAtTime(140 * pitchScale, now + 0.08);
      gain.gain.setValueAtTime(0.14, now);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190 * pitchScale, now);
      osc.frequency.exponentialRampToValueAtTime(85 * pitchScale, now + 0.07);
      gain.gain.setValueAtTime(0.15, now);
    }

    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playStep(inWater: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (inWater) {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(700 + Math.random() * 400, now);
      filter.Q.value = 1.0;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380 + Math.random() * 140, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    }

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.17);
  }
}

export const voxelAudio = new VoxelAudio();
