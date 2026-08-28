export class FsTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FsTimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new FsTimeoutError(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function withFsOp<T>(
  label: string,
  timeoutMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  return withRetry(() => withTimeout(fn(), timeoutMs, label), 1);
}
