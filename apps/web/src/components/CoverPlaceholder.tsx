import { useMemo } from 'react';

interface CoverPlaceholderProps {
  seed: string;
  size: number;
  className?: string;
}

/** Palette drawn from the app tokens so placeholders sit inside the theme. */
const PALETTES = [
  ['#1b1b26', '#2a2a38', '#ffe08a'],
  ['#12121a', '#2f2a3a', '#e2b84a'],
  ['#171722', '#26303c', '#c8d0dc'],
  ['#1a1520', '#3a2a30', '#c68c4a'],
  ['#101820', '#1f2e33', '#8ee0b0'],
  ['#1d1a16', '#332c22', '#ffe08a'],
  ['#141420', '#2b2440', '#9aa4b4'],
  ['#181212', '#332022', '#ff8b7a'],
];

const GRID = 3;

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function makeRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

interface Facet {
  points: string;
  fill: string;
  opacity: number;
}

/**
 * Builds a low-poly mesh by jittering a fixed grid and splitting each cell into
 * two triangles, so the same album always renders the same artwork.
 */
function buildFacets(seed: string): Facet[] {
  const random = makeRandom(hashSeed(seed));
  const palette = PALETTES[Math.floor(random() * PALETTES.length)]!;
  const step = 100 / GRID;
  const jitter = step * 0.34;

  const points: Array<Array<[number, number]>> = [];
  for (let row = 0; row <= GRID; row += 1) {
    const line: Array<[number, number]> = [];
    for (let col = 0; col <= GRID; col += 1) {
      const edge = row === 0 || col === 0 || row === GRID || col === GRID;
      const dx = edge ? 0 : (random() - 0.5) * 2 * jitter;
      const dy = edge ? 0 : (random() - 0.5) * 2 * jitter;
      line.push([col * step + dx, row * step + dy]);
    }
    points.push(line);
  }

  const facets: Facet[] = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const topLeft = points[row]![col]!;
      const topRight = points[row]![col + 1]!;
      const bottomLeft = points[row + 1]![col]!;
      const bottomRight = points[row + 1]![col + 1]!;
      const flipped = random() > 0.5;
      const triangles = flipped
        ? [
            [topLeft, topRight, bottomLeft],
            [topRight, bottomRight, bottomLeft],
          ]
        : [
            [topLeft, topRight, bottomRight],
            [topLeft, bottomRight, bottomLeft],
          ];
      for (const triangle of triangles) {
        facets.push({
          points: triangle
            .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
            .join(' '),
          fill: palette[Math.floor(random() * palette.length)]!,
          opacity: 0.55 + random() * 0.45,
        });
      }
    }
  }
  return facets;
}

export function CoverPlaceholder({ seed, size, className }: CoverPlaceholderProps) {
  const facets = useMemo(() => buildFacets(seed), [seed]);

  return (
    <svg
      className={['cover-art', 'cover-placeholder', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="presentation"
      aria-hidden
      focusable="false"
    >
      {facets.map((facet, index) => (
        <polygon
          key={index}
          points={facet.points}
          fill={facet.fill}
          fillOpacity={facet.opacity}
        />
      ))}
    </svg>
  );
}
