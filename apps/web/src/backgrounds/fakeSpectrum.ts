/** Calm looping spectrum for wavemeter when live audio analysis is unavailable. */
export function sampleFakeSpectrum(
  buffer: Uint8Array,
  timeMs: number,
  barCount: number,
): void {
  const t = timeMs / 1000;
  const usable = Math.min(buffer.length, barCount);

  for (let i = 0; i < usable; i += 1) {
    const phase = i / Math.max(usable - 1, 1);
    const waveA = Math.sin(t * 0.9 + phase * Math.PI * 2.4) * 0.5 + 0.5;
    const waveB = Math.sin(t * 0.55 + phase * Math.PI * 1.1 + 0.8) * 0.5 + 0.5;
    const waveC = Math.sin(t * 0.35 + phase * Math.PI * 0.6 + 1.6) * 0.5 + 0.5;
    const envelope = 0.18 + 0.22 * waveA + 0.14 * waveB + 0.1 * waveC;
    const centerBias = 1 - Math.abs(phase - 0.5) * 0.35;
    buffer[i] = Math.round(Math.min(1, envelope * centerBias) * 120);
  }
}
