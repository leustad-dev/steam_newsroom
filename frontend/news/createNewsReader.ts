import { decodeNewsResponse, type PageReader } from './news';
import { RequestQueue } from './queue';
import { NewsPageCache } from './cache';

type BackendReader = (appId: number, before: number) => Promise<unknown>;

export function createNewsReader(
  backendReader: BackendReader,
  options: { spacingMs?: number; timeoutMs?: number } = {},
) {
  const queue = new RequestQueue(2);
  const cache = new NewsPageCache();
  const readPage: PageReader = (appId, before, signal) => queue.run(async () => {
    const key = `${appId}:${before}`;
    const cached = cache.get(key);
    if (cached !== undefined) return decodeNewsResponse(cached);
    await new Promise(resolve => setTimeout(resolve, options.spacingMs ?? 200));
    signal.throwIfAborted();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload: unknown = await Promise.race([
        backendReader(Number(appId), before),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Steam news request timed out.')), options.timeoutMs ?? 20000);
        }),
      ]);
      signal.throwIfAborted();
      const result = decodeNewsResponse(payload);
      // Always cache JSON text; never coerce an object to "[object Object]".
      cache.set(key, typeof payload === 'string' ? payload : JSON.stringify(result));
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }, signal);

  return { readPage, invalidate: (appId?: string) => cache.invalidate(appId) };
}
