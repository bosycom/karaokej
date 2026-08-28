import type { KaraokeTrackSettings } from '@karaokej/shared';
import {
  KaraokeProcessor,
  KaraokeProcessorContext,
  scheduleGain,
} from './types';

/** Direct passthrough branch — output is a gain node fed from source. */
export class PassthroughKaraokeProcessor implements KaraokeProcessor {
  readonly mode = 'off' as const;
  output: GainNode | null = null;

  build(ctx: KaraokeProcessorContext): AudioNode {
    this.dispose();
    const gain = ctx.context.createGain();
    gain.gain.value = 1;
    ctx.source.connect(gain);
    gain.connect(ctx.destination);
    this.output = gain;
    return gain;
  }

  update(_settings: KaraokeTrackSettings): void {
    /* no-op */
  }

  dispose(): void {
    this.output?.disconnect();
    this.output = null;
  }
}

export function setPassthroughLevel(
  gain: GainNode,
  level: number,
  context: AudioContext,
): void {
  scheduleGain(gain.gain, level, context);
}
