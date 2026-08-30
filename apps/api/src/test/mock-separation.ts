import { vi } from 'vitest';
import { SeparationService } from '../karaoke/separation.service';

export function createMockSeparation(
  patch: Partial<Pick<SeparationService, 'getProcessingTrackId' | 'remove'>> = {},
): SeparationService {
  return {
    getProcessingTrackId: () => null,
    remove: vi.fn(),
    ...patch,
  } as unknown as SeparationService;
}
