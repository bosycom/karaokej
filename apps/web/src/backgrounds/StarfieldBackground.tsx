import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

const STAR_COUNT = 80;

interface Star {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
}

function createStars(width: number, height: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.6 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
    });
  }
  return stars;
}

export function StarfieldBackground() {
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
    let stars: Star[] = [];
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
      stars = createStars(width, height);
    };

    const draw = (timeMs: number) => {
      if (cancelled) {
        return;
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      const t = timeMs / 1000;
      for (const star of stars) {
        const twinkle = reduceMotion
          ? 0.35
          : 0.18 + 0.22 * (Math.sin(t * star.speed + star.phase) * 0.5 + 0.5);
        ctx.fillStyle = `rgba(220, 228, 255, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = globalThis.requestAnimationFrame(draw);
    };

    resize();
    raf = globalThis.requestAnimationFrame(draw);

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
  }, [reduceMotion]);

  return <canvas ref={canvasRef} className="karaoke-bg-canvas" aria-hidden />;
}
