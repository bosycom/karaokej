import { KaraokeMode, KARAOKE_MODES } from '@karaokej/shared';

const MODE_LABELS: Record<KaraokeMode, string> = {
  off: 'Off',
  'vocal-reduction': 'Vocal Reduction',
  ai: 'AI Vocal Removal',
};

interface KaraokeModeControlProps {
  mode: KaraokeMode;
  compact?: boolean;
  disabled?: boolean;
  demucsAvailable?: boolean;
  onChange: (mode: KaraokeMode) => void;
}

export function KaraokeModeControl({
  mode,
  compact = false,
  disabled = false,
  demucsAvailable = false,
  onChange,
}: KaraokeModeControlProps) {
  return (
    <fieldset
      className={`karaoke-mode-control ${compact ? 'compact' : ''}`}
      disabled={disabled}
      aria-label={compact ? 'Karaoke mode' : undefined}
    >
      {!compact && <legend className="karaoke-mode-legend">Karaoke mode</legend>}
      <div className="karaoke-mode-options" role="radiogroup" aria-label="Karaoke mode">
        {KARAOKE_MODES.map((option) => {
          const isAi = option === 'ai';
          const active = mode === option;
          const id = `karaoke-mode-${option}`;
          const optionDisabled = disabled || (isAi && !demucsAvailable);
          return (
            <label
              key={option}
              className={`karaoke-mode-option ${active ? 'active' : ''} ${optionDisabled && isAi ? 'disabled-option' : ''}`}
            >
              <input
                type="radio"
                name="karaoke-mode"
                id={id}
                value={option}
                checked={active}
                disabled={optionDisabled}
                aria-checked={active}
                aria-describedby={isAi ? 'karaoke-ai-hint' : undefined}
                onChange={() => onChange(option)}
              />
              <span className="karaoke-mode-dot" aria-hidden>
                {active ? '●' : '○'}
              </span>
              <span>{MODE_LABELS[option]}</span>
            </label>
          );
        })}
      </div>
      {!compact && (
        <p id="karaoke-ai-hint" className="karaoke-mode-hint">
          {demucsAvailable
            ? 'AI mode uses server-side source separation (Demucs). Realtime vocal reduction plays until the instrumental is ready.'
            : 'AI vocal removal requires Demucs on the server. Install with pipx install demucs and set DEMUCS_PATH in .env.'}
        </p>
      )}
      {compact && !demucsAvailable && (
        <p id="karaoke-ai-hint" className="karaoke-mode-hint compact-hint">
          AI requires Demucs on the server (pipx install demucs).
        </p>
      )}
    </fieldset>
  );
}
