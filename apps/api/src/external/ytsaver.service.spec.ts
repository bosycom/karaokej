import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { YtsaverService } from './ytsaver.service';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('YtsaverService', () => {
  const ytsaverPath = '/mnt/c/Program Files/YT Saver/ytsaverw.exe';
  let service: YtsaverService;
  const mockUnref = vi.fn();

  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockReturnValue({ unref: mockUnref } as never);
    service = new YtsaverService({ ytsaverPath } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports availability from existsSync', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(service.isAvailable()).toBe(true);
    expect(existsSync).toHaveBeenCalledWith(ytsaverPath);

    vi.mocked(existsSync).mockReturnValue(false);
    expect(service.isAvailable()).toBe(false);
  });

  it('throws when the executable is missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(() => service.launch()).toThrow(ServiceUnavailableException);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('spawns the configured executable without shell or user args', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    service.launch();
    expect(spawn).toHaveBeenCalledWith(ytsaverPath, [], {
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    expect(mockUnref).toHaveBeenCalled();
  });
});
