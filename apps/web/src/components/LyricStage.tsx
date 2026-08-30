import { useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { LyricLine, LyricsDto } from '@karaokej/shared';

interface Props {
  lyrics: LyricsDto | null;
  positionMs: number;
  hasTrack: boolean;
  searchingLyrics?: boolean;
}

const ROLES = ['prev', 'current', 'next', 'upcoming'] as const;
type Role = (typeof ROLES)[number];

interface StageRow {
  key: string;
  text: string;
  role: Role;
}

const LINE_EASE = [0.22, 1, 0.36, 1] as const;

const lineVariants = {
  enter: (direction: number) => ({ opacity: 0, y: 32 * direction }),
  visible: { opacity: 1, y: 0 },
  leave: (direction: number) => ({ opacity: 0, y: -32 * direction }),
};

function stageRows(lines: LyricLine[], active: number): StageRow[] {
  const currentIndex = active >= 0 ? active : 0;
  return ROLES.map((role, offset) => {
    const lineIndex = currentIndex + offset - 1;
    const line = lines[lineIndex];
    return {
      key: line ? `line-${lineIndex}` : `empty-${role}`,
      text: line?.text ?? '\u00a0',
      role,
    };
  });
}

export function LyricStage({ lyrics, positionMs, hasTrack, searchingLyrics = false }: Props) {
  const reduceMotion = useReducedMotion();
  const previousIndexRef = useRef(0);

  if (!hasTrack) {
    return (
      <div className="lyric-stage empty-stage">
        <p>Add a song to the queue to begin.</p>
      </div>
    );
  }

  if (!lyrics || !lyrics.available || lyrics.lines.length === 0) {
    return (
      <div className="lyric-stage empty-stage">
        <p>{searchingLyrics ? 'Searching for lyrics…' : 'No synced lyrics'}</p>
        <span>
          {searchingLyrics
            ? 'The song will keep playing while we look for synced lyrics.'
            : 'The song will still play. Fetch lyrics from the controller if they are missing.'}
        </span>
      </div>
    );
  }

  const index = activeIndex(lyrics.lines, positionMs);
  const displayIndex = index >= 0 ? index : 0;
  const direction = displayIndex >= previousIndexRef.current ? 1 : -1;
  previousIndexRef.current = displayIndex;

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.38, ease: LINE_EASE };

  return (
    <div className="lyric-stage" aria-live="polite">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        {stageRows(lyrics.lines, index).map((row) => (
          <motion.p
            key={row.key}
            layout={reduceMotion ? false : 'position'}
            className={`lyric-line ${row.role}`}
            custom={direction}
            variants={lineVariants}
            initial="enter"
            animate="visible"
            exit="leave"
            transition={transition}
          >
            {row.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function activeIndex(
  lines: Array<{ timeMs: number }>,
  positionMs: number,
): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].timeMs <= positionMs + 40) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}
