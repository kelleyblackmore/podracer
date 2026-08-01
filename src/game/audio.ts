/**
 * Fully synthesised audio — no asset downloads, so the game stays a single
 * self-contained bundle. Everything is created lazily on the first race so we
 * only build an AudioContext after a user gesture (browser autoplay policy).
 */
export class RaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private started = false;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  start(): void {
    if (this.started) return;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      this.ctx = new Ctor();
    } catch {
      return; // Audio is a nicety; never let it break the race.
    }
    this.started = true;

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 6;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineFilter.connect(this.engineGain).connect(this.master);

    // Two detuned saws give the twin-engine beat frequency.
    for (const detune of [-9, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      osc.detune.value = detune;
      osc.connect(this.engineFilter);
      osc.start();
      this.oscillators.push(osc);
    }

    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  resume(): void {
    void this.ctx?.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  /** Called every frame with normalised speed (0..1) and boost state. */
  updateEngine(speedRatio: number, boosting: boolean, offTrack: boolean): void {
    if (!this.ctx || !this.engineGain || !this.engineFilter) return;
    const now = this.ctx.currentTime;
    const pitch = 55 + speedRatio * 190 + (boosting ? 45 : 0);
    for (const osc of this.oscillators) {
      osc.frequency.setTargetAtTime(pitch, now, 0.06);
    }
    this.engineFilter.frequency.setTargetAtTime(
      420 + speedRatio * 2100 + (boosting ? 900 : 0),
      now,
      0.08,
    );
    this.engineGain.gain.setTargetAtTime(0.055 + speedRatio * 0.11 + (offTrack ? 0.05 : 0), now, 0.1);
  }

  silenceEngine(): void {
    if (!this.ctx || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  collision(force: number): void {
    this.burst(Math.min(0.5, 0.12 + force * 0.02), 0.35, 260, 'lowpass');
  }

  boost(strength: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880 * strength, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  }

  beep(high: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = high ? 880 : 440;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (high ? 0.6 : 0.18));
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  }

  lap(isBest: boolean): void {
    this.beep(false);
    if (isBest) window.setTimeout(() => this.beep(true), 120);
  }

  private burst(volume: number, duration: number, frequency: number, type: BiquadFilterType): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  dispose(): void {
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.oscillators = [];
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
