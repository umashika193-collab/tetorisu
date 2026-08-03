const MASTER_VOLUME = 0.42;
const MUTED_STORAGE_KEY = "tetorisu:sound-muted";

type VintageOscillator = OscillatorType | "custom";

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  start?: number;
  duration: number;
  gain: number;
  type?: VintageOscillator;
  pan?: number;
}

interface NoiseOptions {
  frequency: number;
  endFrequency?: number;
  start?: number;
  duration: number;
  gain: number;
  filter?: BiquadFilterType;
  pan?: number;
  quality?: number;
}

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * 短い操作音をその場で合成する、映写室風の音響係。
 * 外部音源を使わないため、既存作品の音声素材には依存しない。
 */
export class VintageAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = this.readMutedPreference();
  private suspended = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public isSupported(): boolean {
    return this.getAudioContextConstructor() !== undefined;
  }

  public toggleMuted(): boolean {
    if (!this.isSupported()) {
      return this.muted;
    }

    this.muted = !this.muted;
    this.writeMutedPreference();
    this.updateMasterLevel();

    if (!this.muted && !this.suspended) {
      void this.resume().then(() => this.playSoundCheck());
    }

    return this.muted;
  }

  /** 一時停止中だけ効果音を止める。消音設定そのものは変更しない。 */
  public setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.updateMasterLevel();
  }

  public playStartShow(): void {
    if (this.muted) {
      return;
    }

    void this.resume().then(() => {
      this.noise({ frequency: 820, duration: 0.035, gain: 0.035, filter: "lowpass" });
      this.noise({
        frequency: 940,
        start: 0.085,
        duration: 0.035,
        gain: 0.035,
        filter: "lowpass",
      });
      this.noise({
        frequency: 1080,
        start: 0.17,
        duration: 0.04,
        gain: 0.04,
        filter: "lowpass",
      });
      [261.63, 329.63, 392].forEach((frequency, index) => {
        this.tone({
          frequency,
          start: 0.2 + index * 0.018,
          duration: 0.46,
          gain: 0.032,
          type: "triangle",
        });
      });
    });
  }

  public playMove(direction: -1 | 1): void {
    this.noise({
      frequency: direction < 0 ? 1250 : 1420,
      duration: 0.022,
      gain: 0.013,
      filter: "bandpass",
      pan: direction * 0.16,
      quality: 1.2,
    });
    this.tone({
      frequency: direction < 0 ? 196 : 220,
      duration: 0.026,
      gain: 0.011,
      type: "triangle",
      pan: direction * 0.16,
    });
  }

  public playSoftDrop(): void {
    this.noise({
      frequency: 480,
      duration: 0.028,
      gain: 0.012,
      filter: "lowpass",
    });
    this.tone({
      frequency: 132,
      endFrequency: 104,
      duration: 0.035,
      gain: 0.011,
      type: "triangle",
    });
  }

  public playRotate(direction: "clockwise" | "counterclockwise"): void {
    const clockwise = direction === "clockwise";
    this.noise({
      frequency: 920,
      duration: 0.035,
      gain: 0.018,
      filter: "bandpass",
      quality: 1.4,
    });
    this.tone({
      frequency: clockwise ? 360 : 480,
      endFrequency: clockwise ? 480 : 360,
      duration: 0.065,
      gain: 0.025,
      type: "triangle",
      pan: clockwise ? 0.08 : -0.08,
    });
  }

  public playHold(): void {
    this.tone({
      frequency: 329.63,
      endFrequency: 293.66,
      duration: 0.1,
      gain: 0.024,
      type: "triangle",
      pan: -0.1,
    });
    this.tone({
      frequency: 246.94,
      endFrequency: 277.18,
      start: 0.045,
      duration: 0.12,
      gain: 0.026,
      type: "triangle",
      pan: 0.1,
    });
  }

  public playHardDrop(distance: number): void {
    const duration = Math.min(0.17, 0.075 + Math.max(distance, 0) * 0.006);
    const strength = Math.min(0.07, 0.035 + Math.max(distance, 0) * 0.0025);
    this.noise({
      frequency: 1500,
      endFrequency: 180,
      duration,
      gain: strength,
      filter: "bandpass",
      quality: 0.8,
    });
    this.tone({
      frequency: 230,
      endFrequency: 72,
      duration,
      gain: 0.024,
      type: "sawtooth",
    });
  }

  public playLock(): void {
    this.noise({
      frequency: 650,
      endFrequency: 300,
      duration: 0.055,
      gain: 0.052,
      filter: "lowpass",
    });
    this.tone({
      frequency: 96,
      endFrequency: 72,
      duration: 0.095,
      gain: 0.035,
      type: "sine",
    });
  }

  public playLineClearStart(lines: number): void {
    const emphasis = Math.min(Math.max(lines, 1), 4);
    this.noise({
      frequency: 720,
      endFrequency: 2500,
      duration: 0.33,
      gain: 0.026 + emphasis * 0.005,
      filter: "bandpass",
      quality: 0.7,
    });
    this.noise({
      frequency: 540,
      duration: 0.06,
      gain: 0.055,
      filter: "lowpass",
    });
    this.tone({
      frequency: 220 + emphasis * 18,
      endFrequency: 440 + emphasis * 32,
      duration: 0.34,
      gain: 0.025,
      type: "triangle",
    });
  }

  public playLineClearFinish(lines: number): void {
    const chords: readonly (readonly number[])[] = [
      [],
      [392, 523.25],
      [392, 493.88, 587.33],
      [440, 554.37, 659.25, 783.99],
      [523.25, 659.25, 783.99, 1046.5],
    ];
    const lineCount = Math.min(Math.max(lines, 1), 4);
    const chord = chords[lineCount] ?? chords[1];

    chord?.forEach((frequency, index) => {
      this.tone({
        frequency,
        start: index * 0.014,
        duration: lineCount === 4 ? 0.56 : 0.38,
        gain: lineCount === 4 ? 0.038 : 0.032,
        type: "triangle",
        pan: (index - (chord.length - 1) / 2) * 0.1,
      });
    });

    if (lineCount === 4) {
      this.noise({
        frequency: 1900,
        endFrequency: 3100,
        duration: 0.2,
        gain: 0.035,
        filter: "bandpass",
        quality: 0.9,
      });
    }
  }

  public playLevelUp(): void {
    [392, 523.25, 659.25].forEach((frequency, index) => {
      this.tone({
        frequency,
        start: 0.24 + index * 0.085,
        duration: 0.24,
        gain: 0.027,
        type: "triangle",
      });
    });
  }

  public playGameOver(): void {
    this.noise({
      frequency: 420,
      endFrequency: 120,
      duration: 0.35,
      gain: 0.045,
      filter: "lowpass",
    });
    [392, 311.13, 233.08].forEach((frequency, index) => {
      this.tone({
        frequency,
        endFrequency: frequency * 0.94,
        start: index * 0.18,
        duration: 0.42,
        gain: 0.036,
        type: "triangle",
      });
    });
  }

  public playRestart(): void {
    this.noise({
      frequency: 420,
      endFrequency: 2300,
      duration: 0.24,
      gain: 0.04,
      filter: "bandpass",
      quality: 0.8,
    });
    this.tone({
      frequency: 130,
      endFrequency: 520,
      duration: 0.22,
      gain: 0.02,
      type: "triangle",
    });
  }

  public destroy(): void {
    if (this.context !== null && this.context.state !== "closed") {
      void this.context.close();
    }
  }

  private playSoundCheck(): void {
    this.tone({
      frequency: 523.25,
      endFrequency: 659.25,
      duration: 0.14,
      gain: 0.027,
      type: "triangle",
    });
  }

  private tone(options: ToneOptions): void {
    const context = this.contextForSound();
    if (context === null || this.master === null) {
      return;
    }

    const start = context.currentTime + (options.start ?? 0);
    const end = start + options.duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const panner = context.createStereoPanner();

    oscillator.type =
      options.type === "custom" ? "triangle" : (options.type ?? "triangle");
    oscillator.frequency.setValueAtTime(Math.max(options.frequency, 1), start);
    if (options.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(options.endFrequency, 1),
        end,
      );
    }

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(options.gain, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    panner.pan.setValueAtTime(options.pan ?? 0, start);

    oscillator.connect(envelope).connect(panner).connect(this.master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private noise(options: NoiseOptions): void {
    const context = this.contextForSound();
    if (context === null || this.master === null || this.noiseBuffer === null) {
      return;
    }

    const start = context.currentTime + (options.start ?? 0);
    const end = start + options.duration;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = context.createStereoPanner();

    source.buffer = this.noiseBuffer;
    filter.type = options.filter ?? "bandpass";
    filter.Q.setValueAtTime(options.quality ?? 0.9, start);
    filter.frequency.setValueAtTime(Math.max(options.frequency, 1), start);
    if (options.endFrequency !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(options.endFrequency, 1),
        end,
      );
    }

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(options.gain, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    panner.pan.setValueAtTime(options.pan ?? 0, start);

    source.connect(filter).connect(envelope).connect(panner).connect(this.master);
    source.start(start, Math.random() * 0.45, options.duration + 0.015);
    source.stop(end + 0.02);
  }

  private contextForSound(): AudioContext | null {
    if (this.muted || this.suspended) {
      return null;
    }

    const context = this.ensureContext();
    if (context?.state === "suspended") {
      void context.resume();
    }
    return context;
  }

  private async resume(): Promise<void> {
    const context = this.ensureContext();
    if (context?.state === "suspended") {
      await context.resume();
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context !== null) {
      return this.context;
    }

    const AudioContextConstructor = this.getAudioContextConstructor();
    if (AudioContextConstructor === undefined) {
      return null;
    }

    this.context = new AudioContextConstructor({ latencyHint: "interactive" });
    const compressor = this.context.createDynamicsCompressor();
    this.master = this.context.createGain();

    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    this.master.gain.value = this.muted || this.suspended ? 0 : MASTER_VOLUME;
    this.master.connect(compressor).connect(this.context.destination);
    this.noiseBuffer = this.createNoiseBuffer(this.context);
    return this.context;
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;

    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.62 + white * 0.38;
      data[index] = previous;
    }

    return buffer;
  }

  private updateMasterLevel(): void {
    if (this.context === null || this.master === null) {
      return;
    }

    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(
      this.muted || this.suspended ? 0 : MASTER_VOLUME,
      now,
      0.012,
    );
  }

  private getAudioContextConstructor(): typeof AudioContext | undefined {
    return window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
  }

  private readMutedPreference(): boolean {
    try {
      return window.localStorage.getItem(MUTED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  private writeMutedPreference(): void {
    try {
      window.localStorage.setItem(MUTED_STORAGE_KEY, String(this.muted));
    } catch {
      // 保存できない環境でも、その場の消音操作は有効にする。
    }
  }
}
