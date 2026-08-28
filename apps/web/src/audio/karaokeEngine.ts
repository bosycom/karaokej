import type { KaraokeStateDto, KaraokeTrackSettings, TrackDto } from '@karaokej/shared';
import { AiVocalRemovalProcessor } from './processors/aiVocalRemovalProcessor';
import {
  PassthroughKaraokeProcessor,
  setPassthroughLevel,
} from './processors/passthroughProcessor';
import { RealtimeVocalReductionProcessor } from './processors/realtimeVocalReductionProcessor';
import {
  KaraokeEngineStatus,
  scheduleGain,
} from './processors/types';

export interface AudioContextFactory {
  create(): AudioContext;
}

export interface KaraokeEngineSnapshot {
  status: KaraokeEngineStatus;
  aiFallback: boolean;
}

type WindowWithAudio = Window &
  typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };

export class KaraokeAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private passthrough = new PassthroughKaraokeProcessor();
  private reduction = new RealtimeVocalReductionProcessor();
  private ai = new AiVocalRemovalProcessor();
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private attached = false;
  private everEnabled = false;
  private status: KaraokeEngineStatus = 'idle';
  private aiFallback = false;
  private lastMode: KaraokeStateDto['mode'] = 'off';
  private lastSettings: KaraokeTrackSettings | null = null;
  private lastTrack: TrackDto | null = null;
  private resumeCleanup: (() => void) | null = null;
  private readonly createContext: () => AudioContext;
  private readonly injectedFactory: boolean;
  private pendingWork: Promise<void> = Promise.resolve();

  constructor(createContext?: AudioContextFactory) {
    this.injectedFactory = Boolean(createContext);
    this.createContext =
      createContext?.create.bind(createContext) ??
      (() => {
        const win = globalThis as WindowWithAudio;
        const Ctx = win.AudioContext ?? win.webkitAudioContext;
        if (!Ctx) {
          throw new Error('AudioContext unavailable');
        }
        return new Ctx();
      });
  }

  bind(audio: HTMLAudioElement): void {
    this.audio = audio;
  }

  getSnapshot(): KaraokeEngineSnapshot {
    return { status: this.status, aiFallback: this.aiFallback };
  }

  applyState(state: KaraokeStateDto, track: TrackDto | null): void {
    this.lastTrack = track;
    this.lastMode = state.mode;
    this.lastSettings = {
      ...state.live,
      eqBands: state.live.eqBands.map((band) => ({ ...band })),
    };
    this.pendingWork = this.pendingWork
      .then(() => this.applyStateInternal(state))
      .catch(() => undefined);
  }

  /** Await pending attach/apply work — intended for tests. */
  async sync(): Promise<void> {
    await this.pendingWork;
  }

  dispose(): void {
    this.clearResumeListener();
    this.passthrough.dispose();
    this.reduction.dispose();
    this.ai.dispose();
    try {
      this.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.masterGain?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    void this.ctx?.close();
    this.analyser = null;
    this.masterGain = null;
    this.source = null;
    this.ctx = null;
    this.attached = false;
    this.status = 'idle';
    this.aiFallback = false;
    this.pendingWork = Promise.resolve();
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  getSource(): MediaElementAudioSourceNode | null {
    return this.source;
  }

  getReductionProcessor(): RealtimeVocalReductionProcessor {
    return this.reduction;
  }

  getPassthroughOutput(): GainNode | null {
    return this.passthrough.output;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** Attach the audio graph for frequency analysis without enabling karaoke processing. */
  async ensureAnalysis(): Promise<AnalyserNode | null> {
    if (!this.browserSupportsWebAudio() || !this.audio) {
      return null;
    }
    this.pendingWork = this.pendingWork
      .then(async () => {
        await this.ensureAttached();
        if (!this.attached) {
          return;
        }
        if (this.lastMode === 'off') {
          this.applyOutputMix('off');
        }
      })
      .catch(() => undefined);
    await this.pendingWork;
    return this.analyser;
  }

  private async applyStateInternal(state: KaraokeStateDto): Promise<void> {
    try {
      if (state.mode === 'off' && !this.everEnabled) {
        this.status = this.browserSupportsWebAudio() ? 'idle' : 'unsupported';
        return;
      }
      if (!this.browserSupportsWebAudio()) {
        this.status = 'unsupported';
        return;
      }
      if (state.mode !== 'off') {
        this.everEnabled = true;
      }
      await this.ensureAttached();
      if (!this.attached) {
        return;
      }
      await this.applyMode(state.mode, state.stem);
      const reductionSettings =
        state.mode === 'ai' && state.stem?.status === 'ready'
          ? { ...state.live, centerAmount: 0 }
          : state.live;
      this.reduction.update(reductionSettings);
    } catch {
      this.status = this.attached ? 'active' : 'idle';
    }
  }

  private browserSupportsWebAudio(): boolean {
    if (this.injectedFactory) {
      return true;
    }
    const win = globalThis as WindowWithAudio;
    return Boolean(win.AudioContext ?? win.webkitAudioContext);
  }

  private async ensureAttached(): Promise<void> {
    if (this.attached || !this.audio) {
      return;
    }
    try {
      this.ctx = this.createContext();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => undefined);
      }
      if (this.ctx.state !== 'running') {
        this.status = 'blocked';
        this.setupResumeListener();
        return;
      }
      this.source = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.source.connect(this.analyser);
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);

      const procCtx = {
        context: this.ctx,
        source: this.source,
        destination: this.masterGain,
      };
      this.passthrough.build(procCtx);
      this.reduction.build(procCtx);
      this.ai.build(procCtx);

      this.attached = true;
      this.status = 'active';
    } catch {
      this.status = 'unsupported';
    }
  }

  private setupResumeListener(): void {
    if (this.resumeCleanup) {
      return;
    }
    if (typeof globalThis.addEventListener !== 'function') {
      return;
    }
    const retry = () => {
      void this.ensureAttached().then(() => {
        if (this.attached && this.lastSettings) {
          this.applyState(
            {
              mode: this.lastMode,
              live: this.lastSettings,
              isDefault: true,
              trackId: this.lastTrack?.id ?? null,
              stem: null,
            },
            this.lastTrack,
          );
        }
      });
    };
    const onGesture = () => retry();
    globalThis.addEventListener('pointerdown', onGesture, { once: true });
    globalThis.addEventListener('keydown', onGesture, { once: true });
    this.resumeCleanup = () => {
      if (typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('pointerdown', onGesture);
        globalThis.removeEventListener('keydown', onGesture);
      }
    };
  }

  private clearResumeListener(): void {
    this.resumeCleanup?.();
    this.resumeCleanup = null;
  }

  private async applyMode(
    mode: KaraokeStateDto['mode'],
    stem: KaraokeStateDto['stem'],
  ): Promise<void> {
    this.lastMode = mode;
    if (!this.ctx || !this.attached) {
      return;
    }
    this.aiFallback = false;
    if (mode === 'ai') {
      const readiness = await this.ai.prepare?.(stem ?? null);
      if (readiness?.status !== 'ready') {
        this.aiFallback = true;
        this.applyOutputMix('vocal-reduction');
        return;
      }
    }
    this.applyOutputMix(mode);
  }

  private applyOutputMix(mode: KaraokeStateDto['mode']): void {
    if (!this.ctx || !this.passthrough.output) {
      return;
    }
    const effectiveMode =
      mode === 'ai' && this.aiFallback ? 'vocal-reduction' : mode;
    const bypass = effectiveMode === 'off' ? 1 : 0;
    const reduce =
      effectiveMode === 'vocal-reduction' || effectiveMode === 'ai' ? 1 : 0;
    setPassthroughLevel(this.passthrough.output, bypass, this.ctx);
    this.reduction.setOutputLevel(reduce);
    this.status = this.aiFallback ? 'ai-fallback' : 'active';
  }
}

let sharedEngine: KaraokeAudioEngine | null = null;

export function getKaraokeEngine(): KaraokeAudioEngine {
  if (!sharedEngine) {
    sharedEngine = new KaraokeAudioEngine();
  }
  return sharedEngine;
}

export function resetKaraokeEngineForTests(): void {
  sharedEngine?.dispose();
  sharedEngine = null;
}
