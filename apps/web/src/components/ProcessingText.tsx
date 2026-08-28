import type { ReactNode } from 'react';

export function ProcessingText({ children }: { children: ReactNode }) {
  return <span className="processing-text">{children}</span>;
}
