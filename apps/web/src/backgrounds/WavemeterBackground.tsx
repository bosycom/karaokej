import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { getKaraokeEngine } from '../audio/karaokeEngine';
import { sampleFakeSpectrum } from './fakeSpectrum';

interface Props {
  isPlayer: boolean;
}

const BAR_COUNT = 48;
const FFT_SIZE = 256;

export function WavemeterBackground({ isPlayer }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let raf = 0;
    let analyser: AnalyserNode | null = null;
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;
    let cancelled = false;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) {
        return;
      }
      const dpr = Math.min(globalThis.devicePixelRatio ?? 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (timeMs: number) => {
      if (cancelled) {
        return;
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      const data = frequencyData ?? new Uint8Array(BAR_COUNT);
      if (analyser && frequencyData && !reduceMotion) {
        analyser.getByteFrequencyData(frequencyData);
      } else {
        sampleFakeSpectrum(data, timeMs, BAR_COUNT);
      }

      const barWidth = width / BAR_COUNT;
      const centerY = height * 0.62;
      const maxBarHeight = height * 0.28;

      for (let i = 0; i < BAR_COUNT; i += 1) {
        const value = data[i] / 255;
        const barHeight = value * maxBarHeight;
        const x = i * barWidth + barWidth * 0.18;
        const w = barWidth * 0.64;
        const hue = 190 + (i / BAR_COUNT) * 90;
        ctx.fillStyle = `hsla(${hue}, 55%, 42%, ${0.12 + value * 0.22})`;
        ctx.fillRect(x, centerY - barHeight, w, barHeight);
        ctx.fillRect(x, centerY, w, barHeight * 0.55);
      }

      raf = globalThis.requestAnimationFrame(draw);
    };

    const start = async () => {
      resize();

      if (isPlayer && !reduceMotion) {
        const engine = getKaraokeEngine();
        analyser = await engine.ensureAnalysis();
        if (analyser) {
          analyser.fftSize = FFT_SIZE;
          analyser.smoothingTimeConstant = 0.82;
          frequencyData = new Uint8Array(analyser.frequencyBinCount);
        }
      }

      if (cancelled) {
        return;
      }

      raf = globalThis.requestAnimationFrame(draw);
    };

    void start();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resize())
      : null;
    observer?.observe(canvas.parentElement ?? canvas);
    globalThis.addEventListener('resize', resize);

    return () => {
      cancelled = true;
      globalThis.cancelAnimationFrame(raf);
      observer?.disconnect();
      globalThis.removeEventListener('resize', resize);
    };
  }, [isPlayer, reduceMotion]);

  return <canvas ref={canvasRef} className="karaoke-bg-canvas" aria-hidden />;
}
