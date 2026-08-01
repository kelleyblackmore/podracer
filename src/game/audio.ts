/**
 * Fully synthesised audio — no asset downloads, so the game stays a single
 * self-contained bundle. Everything is created lazily on the first race so we
 * only build an AudioContext after a user gesture (browser autoplay policy).
 *
 * The mix is deliberately engine-light: the player's own engine sits low so the
 * things that carry information — a rival closing from behind, tyres letting
 * go, the wind rising with speed — are all audible over it.
 */

/** Peak gain of the player's engine. Everything else is balanced against this. */
const PLAYER_ENGINE_GAIN = 0.075;
/** Rival engines are quieter still and fall away with distance. */
const RIVAL_ENGINE_GAIN = 0.055;
/** Distance in world units at which a rival becomes inaudible. */
const RIVAL_EARSHOT = 1500;

interface EngineVoice {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
}

export class RaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private started = false;

  private playerEngine: EngineVoice | null = null;
  private rivalEngines = new Map<string, EngineVoice>();

  /** Continuous beds, gated by gain rather than started and stopped. */
  private scrubGain: GainNode | null = null;
  private scrubFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  start(): void {
    if (this.started) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      this.ctx = new Ctor();
    } catch {
      return; // Audio is a nicety; never let it break the race.
    }
    this.started = true;

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    this.playerEngine = this.createEngine(false);
    this.createScrubBed();
    this.createWindBed();
  }

  /** Twin detuned saws through a lowpass — the beat frequency is the pod's growl. */
  private createEngine(panned: boolean): EngineVoice | null {
    if (!this.ctx || !this.master) return null;
    const ctx = this.ctx;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 5;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    let panner: StereoPannerNode | null = null;
    if (panned && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      filter.connect(gain).connect(panner).connect(this.master);
    } else {
      filter.connect(gain).connect(this.master);
    }

    const oscillators: OscillatorNode[] = [];
    for (const detune of [-9, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
      oscillators.push(osc);
    }

    return { oscillators, filter, gain, panner };
  }

  /** Looping filtered noise for tyre scrub, opened up while sliding. */
  private createScrubBed(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.scrubFilter = filter;
    this.scrubGain = gain;
  }

  /** Looping highpassed noise, rising with speed. */
  private createWindBed(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.windGain = gain;
  }

  resume(): void {
    void this.ctx?.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Player engine plus the continuous beds. `slip` is the pod's slide angle
   * (0..1) and drives the tyre scrub independently of the drift button, so a
   * pod sliding wide sounds like it even without a deliberate drift.
   */
  updateEngine(
    speedRatio: number,
    boosting: boolean,
    offTrack: boolean,
    slip = 0,
    airborne = false,
  ): void {
    if (!this.ctx || !this.playerEngine) return;
    const now = this.ctx.currentTime;
    const voice = this.playerEngine;

    const pitch = 52 + speedRatio * 175 + (boosting ? 45 : 0);
    for (const osc of voice.oscillators) osc.frequency.setTargetAtTime(pitch, now, 0.06);
    voice.filter.frequency.setTargetAtTime(
      380 + speedRatio * 1900 + (boosting ? 900 : 0),
      now,
      0.08,
    );
    // Engines thin out with nothing to push against.
    const airFactor = airborne ? 0.55 : 1;
    voice.gain.gain.setTargetAtTime(
      (0.03 + speedRatio * PLAYER_ENGINE_GAIN) * airFactor,
      now,
      0.1,
    );

    if (this.scrubGain && this.scrubFilter) {
      const scrub = airborne ? 0 : Math.min(1, slip) * speedRatio;
      this.scrubGain.gain.setTargetAtTime(scrub * 0.16 + (offTrack ? 0.05 : 0), now, 0.06);
      this.scrubFilter.frequency.setTargetAtTime(900 + scrub * 1800, now, 0.08);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(speedRatio * speedRatio * 0.05, now, 0.12);
    }
  }

  /**
   * One voice per rival, gained by distance and panned by which side of the
   * player they are on — so you can hear someone drawing alongside.
   */
  updateRival(
    id: string,
    speedRatio: number,
    distance: number,
    pan: number,
    boosting: boolean,
  ): void {
    if (!this.ctx) return;

    if (distance > RIVAL_EARSHOT) {
      const existing = this.rivalEngines.get(id);
      if (existing) existing.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      return;
    }

    let voice = this.rivalEngines.get(id);
    if (!voice) {
      const created = this.createEngine(true);
      if (!created) return;
      voice = created;
      this.rivalEngines.set(id, voice);
    }

    const now = this.ctx.currentTime;
    // Inverse falloff, squared so distant pods drop away quickly.
    const proximity = Math.max(0, 1 - distance / RIVAL_EARSHOT) ** 2;
    const pitch = 50 + speedRatio * 165 + (boosting ? 40 : 0);
    for (const osc of voice.oscillators) osc.frequency.setTargetAtTime(pitch, now, 0.08);
    voice.filter.frequency.setTargetAtTime(320 + speedRatio * 1500, now, 0.1);
    voice.gain.gain.setTargetAtTime(proximity * RIVAL_ENGINE_GAIN, now, 0.09);
    voice.panner?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.08);
  }

  silenceEngine(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.playerEngine?.gain.gain.setTargetAtTime(0, now, 0.15);
    this.scrubGain?.gain.setTargetAtTime(0, now, 0.1);
    this.windGain?.gain.setTargetAtTime(0, now, 0.1);
    for (const voice of this.rivalEngines.values()) {
      voice.gain.gain.setTargetAtTime(0, now, 0.15);
    }
  }

  collision(force: number): void {
    this.burst(Math.min(0.5, 0.12 + force * 0.02), 0.35, 260, 'lowpass');
  }

  /** Pod-to-pod scrape: shorter and brighter than hitting a wall. */
  contact(force: number): void {
    this.burst(Math.min(0.34, 0.08 + force * 0.22), 0.2, 1800, 'bandpass');
  }

  /** Landing thud: a low body hit plus a dust-coloured noise puff. */
  land(force: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.22);
    const peak = 0.12 + force * 0.3;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);

    this.burst(0.1 + force * 0.16, 0.3, 620, 'lowpass');
  }

  /** Take-off: engines unload as the pod leaves the ramp. */
  takeoff(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
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
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.04);
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
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
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
    const voices = [this.playerEngine, ...this.rivalEngines.values()];
    for (const voice of voices) {
      for (const osc of voice?.oscillators ?? []) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    this.playerEngine = null;
    this.rivalEngines.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
