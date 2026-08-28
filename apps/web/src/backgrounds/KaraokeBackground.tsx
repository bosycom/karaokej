import type { AnimatedBackground } from './backgroundMode';
import { resolveActiveBackground } from './backgroundMode';
import { useBackgroundMode } from './useBackgroundMode';
import { StarfieldBackground } from './StarfieldBackground';
import { WavemeterBackground } from './WavemeterBackground';

interface Props {
  trackId: string | null;
  isPlayer: boolean;
}

function CssBackground({ variant }: { variant: Exclude<AnimatedBackground, 'wavemeter' | 'starfield'> }) {
  return <div className={`karaoke-bg karaoke-bg-${variant}`} aria-hidden />;
}

export function KaraokeBackground({ trackId, isPlayer }: Props) {
  const mode = useBackgroundMode();
  const active = resolveActiveBackground(mode, trackId);

  return (
    <div className="karaoke-bg-layer" aria-hidden>
      {active === 'wavemeter' && <WavemeterBackground isPlayer={isPlayer} />}
      {active === 'starfield' && <StarfieldBackground />}
      {active === 'gradients' && <CssBackground variant="gradients" />}
      {active === 'aurora' && <CssBackground variant="aurora" />}
      {active === 'orbs' && <CssBackground variant="orbs" />}
      {active === 'hue-wash' && <CssBackground variant="hue-wash" />}
    </div>
  );
}
