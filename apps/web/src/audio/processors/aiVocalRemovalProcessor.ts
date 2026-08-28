import type { KaraokeStemDto } from '@karaokej/shared';
import {
  KaraokeProcessor,
  KaraokeProcessorContext,
  KaraokeProcessorReadiness,
} from './types';

/** Server-side Demucs stem playback — routes through vocal reduction EQ only. */
export class AiVocalRemovalProcessor implements KaraokeProcessor {
  readonly mode = 'ai' as const;
  output: GainNode | null = null;

  build(ctx: KaraokeProcessorContext): AudioNode {
    this.dispose();
    const gain = ctx.context.createGain();
    gain.gain.value = 0;
    this.output = gain;
    return gain;
  }

  async prepare(stem: KaraokeStemDto | null): Promise<KaraokeProcessorReadiness> {
    if (!stem) {
      return {
        status: 'unsupported',
        message: 'No instrumental stem for this track',
      };
    }
    switch (stem.status) {
      case 'ready':
        return { status: 'ready' };
      case 'pending':
      case 'processing':
        return {
          status: 'processing',
          message: stem.error ?? 'Preparing instrumental…',
        };
      case 'failed':
        return {
          status: 'failed',
          message: stem.error ?? 'Instrumental separation failed',
        };
      case 'unsupported':
        return {
          status: 'unsupported',
          message: stem.error ?? 'AI vocal removal is not available',
        };
      default:
        return {
          status: 'unsupported',
          message: 'No instrumental stem for this track',
        };
    }
  }

  update(): void {
    /* EQ is applied by RealtimeVocalReductionProcessor when stem is active */
  }

  dispose(): void {
    this.output?.disconnect();
    this.output = null;
  }
}
