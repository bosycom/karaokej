import type { KaraokeTrackSettings } from '@karaokej/shared';
import {
  dbToLinear,
  KaraokeProcessor,
  KaraokeProcessorContext,
  scheduleGain,
} from './types';

/**
 * Real-time stereo centre cancellation via mid/side matrix:
 * L' = L·(1 - a/2) + R·(-a/2)
 * R' = L·(-a/2) + R·(1 - a/2)
 */
export class RealtimeVocalReductionProcessor implements KaraokeProcessor {
  readonly mode = 'vocal-reduction' as const;
  output: GainNode | null = null;

  private ctx: AudioContext | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private gLL: GainNode | null = null;
  private gRL: GainNode | null = null;
  private gLR: GainNode | null = null;
  private gRR: GainNode | null = null;
  private midSum: GainNode | null = null;
  private gMidL: GainNode | null = null;
  private gMidR: GainNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private retainLowGain: GainNode | null = null;
  private retainHighGain: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private limiter: DynamicsCompressorNode | null = null;
  private makeupGain: GainNode | null = null;
  private mixGain: GainNode | null = null;
  private settings: KaraokeTrackSettings | null = null;

  build(ctx: KaraokeProcessorContext): AudioNode {
    this.dispose();
    this.ctx = ctx.context;

    const splitter = ctx.context.createChannelSplitter(2);
    const merger = ctx.context.createChannelMerger(2);
    const gLL = ctx.context.createGain();
    const gRL = ctx.context.createGain();
    const gLR = ctx.context.createGain();
    const gRR = ctx.context.createGain();
    const midSum = ctx.context.createGain();
    midSum.gain.value = 1;
    const gMidL = ctx.context.createGain();
    gMidL.gain.value = 0.5;
    const gMidR = ctx.context.createGain();
    gMidR.gain.value = 0.5;
    const bassFilter = ctx.context.createBiquadFilter();
    bassFilter.type = 'lowpass';
    const trebleFilter = ctx.context.createBiquadFilter();
    trebleFilter.type = 'highpass';
    const retainLowGain = ctx.context.createGain();
    const retainHighGain = ctx.context.createGain();
    const limiter = ctx.context.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    const makeupGain = ctx.context.createGain();
    makeupGain.gain.value = 1;
    const mixGain = ctx.context.createGain();
    mixGain.gain.value = 0;

    ctx.source.connect(splitter);

    splitter.connect(gLL, 0);
    splitter.connect(gRL, 1);
    splitter.connect(gLR, 0);
    splitter.connect(gRR, 1);

    gLL.connect(merger, 0, 0);
    gRL.connect(merger, 0, 0);
    gLR.connect(merger, 0, 1);
    gRR.connect(merger, 0, 1);

    splitter.connect(gMidL, 0);
    splitter.connect(gMidR, 1);
    gMidL.connect(midSum);
    gMidR.connect(midSum);
    midSum.connect(bassFilter);
    midSum.connect(trebleFilter);
    bassFilter.connect(retainLowGain);
    trebleFilter.connect(retainHighGain);
    retainLowGain.connect(merger, 0, 0);
    retainLowGain.connect(merger, 0, 1);
    retainHighGain.connect(merger, 0, 0);
    retainHighGain.connect(merger, 0, 1);

    this.splitter = splitter;
    this.merger = merger;
    this.gLL = gLL;
    this.gRL = gRL;
    this.gLR = gLR;
    this.gRR = gRR;
    this.midSum = midSum;
    this.gMidL = gMidL;
    this.gMidR = gMidR;
    this.bassFilter = bassFilter;
    this.trebleFilter = trebleFilter;
    this.retainLowGain = retainLowGain;
    this.retainHighGain = retainHighGain;
    this.limiter = limiter;
    this.makeupGain = makeupGain;
    this.mixGain = mixGain;
    this.eqFilters = [];

    this.rebuildEqChain();
    mixGain.connect(ctx.destination);
    this.output = mixGain;
    if (this.settings) {
      this.applyMatrixAndFilters(this.settings);
    }
    return mixGain;
  }

  update(settings: KaraokeTrackSettings): void {
    this.settings = {
      ...settings,
      eqBands: settings.eqBands.map((band) => ({ ...band })),
    };
    if (!this.ctx || !this.merger || !this.mixGain) {
      return;
    }
    this.rebuildEqChain();
    this.applyMatrixAndFilters(this.settings);
  }

  dispose(): void {
    for (const node of [
      this.splitter,
      this.merger,
      this.gLL,
      this.gRL,
      this.gLR,
      this.gRR,
      this.midSum,
      this.gMidL,
      this.gMidR,
      this.bassFilter,
      this.trebleFilter,
      this.retainLowGain,
      this.retainHighGain,
      ...this.eqFilters,
      this.limiter,
      this.makeupGain,
      this.mixGain,
    ]) {
      try {
        node?.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.splitter = null;
    this.merger = null;
    this.gLL = null;
    this.gRL = null;
    this.gLR = null;
    this.gRR = null;
    this.midSum = null;
    this.gMidL = null;
    this.gMidR = null;
    this.bassFilter = null;
    this.trebleFilter = null;
    this.retainLowGain = null;
    this.retainHighGain = null;
    this.eqFilters = [];
    this.limiter = null;
    this.makeupGain = null;
    this.mixGain = null;
    this.output = null;
    this.ctx = null;
    this.settings = null;
  }

  setOutputLevel(level: number): void {
    if (this.mixGain && this.ctx) {
      scheduleGain(this.mixGain.gain, level, this.ctx);
    }
  }

  getMixLevel(): number {
    return this.mixGain?.gain.value ?? 0;
  }

  getChannelMatrixLevels(): { same: number; cross: number } {
    return {
      same: this.gLL?.gain.value ?? 0,
      cross: this.gRL?.gain.value ?? 0,
    };
  }

  getMatrixGains(centerAmount: number): { same: number; cross: number } {
    const a = centerAmount;
    return { same: 1 - a / 2, cross: -a / 2 };
  }

  private rebuildEqChain(): void {
    if (!this.ctx || !this.merger || !this.limiter || !this.makeupGain || !this.mixGain) {
      return;
    }
    for (const filter of this.eqFilters) {
      try {
        filter.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.eqFilters = [];
    try {
      this.merger.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.limiter.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.makeupGain.disconnect();
    } catch {
      /* ignore */
    }

    const bands = this.settings?.eqBands ?? [];
    let prev: AudioNode = this.merger;
    for (const band of bands) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;
      prev.connect(filter);
      prev = filter;
      this.eqFilters.push(filter);
    }
    prev.connect(this.limiter);
    this.limiter.connect(this.makeupGain);
    this.makeupGain.connect(this.mixGain);
  }

  private applyMatrixAndFilters(settings: KaraokeTrackSettings): void {
    if (!this.ctx) {
      return;
    }
    const { same, cross } = this.getMatrixGains(settings.centerAmount);
    if (this.gLL) scheduleGain(this.gLL.gain, same, this.ctx);
    if (this.gRR) scheduleGain(this.gRR.gain, same, this.ctx);
    if (this.gRL) scheduleGain(this.gRL.gain, cross, this.ctx);
    if (this.gLR) scheduleGain(this.gLR.gain, cross, this.ctx);

    if (this.bassFilter) {
      this.bassFilter.frequency.value = settings.bassRetainHz;
    }
    if (this.trebleFilter) {
      this.trebleFilter.frequency.value = settings.trebleRetainHz;
    }

    const retainAmount = settings.centerAmount * 0.35;
    if (this.retainLowGain) {
      scheduleGain(this.retainLowGain.gain, retainAmount, this.ctx);
    }
    if (this.retainHighGain) {
      scheduleGain(this.retainHighGain.gain, retainAmount * 0.5, this.ctx);
    }

    for (let i = 0; i < this.eqFilters.length; i++) {
      const band = settings.eqBands[i];
      if (!band) {
        continue;
      }
      const filter = this.eqFilters[i];
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;
    }

    if (this.makeupGain) {
      scheduleGain(
        this.makeupGain.gain,
        dbToLinear(settings.makeupGainDb),
        this.ctx,
      );
    }
  }
}
