/**
 * All audio is synthesized with WebAudio — no assets, pure 1978.
 */

const MUTE_KEY = "spacediffs_muted";

class ArcadeSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ufoOsc: OscillatorNode | null = null;
  private ufoLfo: OscillatorNode | null = null;
  muted = localStorage.getItem(MUTE_KEY) === "1";

  /** Must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.01);
    }
    return this.muted;
  }

  private tone(
    freq: number,
    duration: number,
    opts: {
      type?: OscillatorType;
      volume?: number;
      slideTo?: number;
      delay?: number;
    } = {},
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const { type = "square", volume = 0.22, slideTo, delay = 0 } = opts;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), start + duration);
    }
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume = 0.3, filterFreq = 1200) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  shoot() {
    this.tone(880, 0.12, { slideTo: 240, volume: 0.15 });
  }

  invaderKilled() {
    this.noise(0.12, 0.25, 2000);
    this.tone(160, 0.1, { type: "sawtooth", slideTo: 60, volume: 0.18 });
  }

  eliteHit() {
    this.tone(320, 0.08, { type: "sawtooth", slideTo: 200, volume: 0.2 });
  }

  eliteKilled() {
    this.noise(0.35, 0.35, 1500);
    [660, 550, 440, 330].forEach((f, i) => this.tone(f, 0.1, { delay: i * 0.06, volume: 0.2 }));
  }

  playerExplode() {
    this.noise(0.6, 0.4, 900);
    this.tone(110, 0.5, { type: "sawtooth", slideTo: 30, volume: 0.25 });
  }

  private static MARCH = [116.54, 110.0, 103.83, 98.0];
  march(step: number) {
    this.tone(ArcadeSound.MARCH[step % 4], 0.09, { type: "square", volume: 0.14 });
  }

  ufoStart() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.ufoStop();
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 620;
    lfo.type = "sine";
    lfo.frequency.value = 9;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0.08;
    osc.connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.ufoOsc = osc;
    this.ufoLfo = lfo;
  }

  ufoStop() {
    this.ufoOsc?.stop();
    this.ufoLfo?.stop();
    this.ufoOsc = null;
    this.ufoLfo = null;
  }

  ufoKilled() {
    this.ufoStop();
    [880, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.09, { delay: i * 0.05, volume: 0.2 }));
  }

  powerup() {
    [330, 440, 554, 659, 880].forEach((f, i) =>
      this.tone(f, 0.08, { delay: i * 0.05, type: "square", volume: 0.16 }),
    );
  }

  waveClear() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, { delay: i * 0.09, volume: 0.2 }));
  }

  gameOver() {
    [392, 370, 349, 330, 311, 294, 277, 262].forEach((f, i) =>
      this.tone(f, 0.16, { delay: i * 0.13, type: "sawtooth", volume: 0.18 }),
    );
  }

  uiMove() {
    this.tone(440, 0.04, { volume: 0.08 });
  }

  uiSelect() {
    this.tone(660, 0.07, { volume: 0.12 });
    this.tone(880, 0.07, { delay: 0.06, volume: 0.12 });
  }

  approveStamp() {
    this.tone(523, 0.08, { volume: 0.16 });
    this.tone(784, 0.12, { delay: 0.07, volume: 0.16 });
  }

  flagStamp() {
    this.tone(220, 0.12, { type: "sawtooth", volume: 0.2 });
    this.tone(165, 0.18, { delay: 0.1, type: "sawtooth", volume: 0.2 });
  }
}

export const sfx = new ArcadeSound();
