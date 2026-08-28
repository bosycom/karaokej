import type { KaraokeMode, KaraokeStemDto, KaraokeTrackSettings } from '@karaokej/shared';

export type KaraokeEngineStatus =
  | 'unsupported'
  | 'idle'
  | 'blocked'
  | 'active'
  | 'ai-fallback';

export interface KaraokeProcessorReadiness {
  status: 'ready' | 'processing' | 'unsupported' | 'failed';
  message?: string;
}

export interface KaraokeProcessorContext {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  destination: AudioNode;
}

export interface KaraokeProcessor {
  readonly mode: KaraokeMode;
  /** Output node of this processor's subgraph. */
  output: AudioNode | null;
  build(ctx: KaraokeProcessorContext): AudioNode;
  update(settings: KaraokeTrackSettings): void;
  prepare?(stem: KaraokeStemDto | null): Promise<KaraokeProcessorReadiness>;
  dispose(): void;
}

export const RAMP_SECONDS = 0.02;

export function scheduleGain(
  param: AudioParam,
  value: number,
  context: AudioContext,
): void {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, RAMP_SECONDS);
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
