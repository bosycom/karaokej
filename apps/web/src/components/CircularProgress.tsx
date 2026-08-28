interface CircularProgressProps {
  percent: number;
  size?: number;
  indeterminate?: boolean;
  title?: string;
}

export function CircularProgress({
  percent,
  size = 28,
  indeterminate = false,
  title,
}: CircularProgressProps) {
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;
  const label =
    title ??
    (indeterminate ? 'Queued for AI separation' : `AI separation ${clamped}%`);

  return (
    <span
      className={`circular-progress${indeterminate ? ' indeterminate' : ''}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      title={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : clamped}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          className="circular-progress-track"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="circular-progress-fill"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          strokeDasharray={circumference}
          strokeDashoffset={indeterminate ? circumference * 0.75 : offset}
        />
      </svg>
      {!indeterminate && clamped > 0 && size >= 26 && (
        <span className="circular-progress-label">{clamped}</span>
      )}
    </span>
  );
}
