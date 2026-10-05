/** First non-empty line from process output, trimmed. */
export function firstVersionLine(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`.split(/\r?\n/);
  for (const line of combined) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}
