import { readArtworkUrl } from './artwork';
import { RequestQueue } from '../news/queue';

const queue = new RequestQueue(2);
const cached = new Map<string, { url?: string; expires: number }>();
const pending = new Map<string, Promise<string | undefined>>();
export function resolveArtwork(appId: string): Promise<string | undefined> {
  const previous = cached.get(appId);
  if (previous && previous.expires > Date.now()) return Promise.resolve(previous.url);
  const active = pending.get(appId);
  if (active) return active;
  const request = queue.run(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let url: string | undefined;
    try {
      const result = await Promise.race([
        backend.fetch_artwork(Number(appId)),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Artwork timed out')), 15000); }),
      ]);
      url = readArtworkUrl(result, appId);
    } catch { /* Artwork never blocks library/news. */ }
    finally { if (timer) clearTimeout(timer); }
    cached.delete(appId);
    cached.set(appId, { url, expires: Date.now() + (url ? 6 * 3600000 : 5 * 60000) });
    while (cached.size > 1024) cached.delete(cached.keys().next().value!);
    return url;
  }, new AbortController().signal).finally(() => pending.delete(appId));
  pending.set(appId, request);
  return request;
}
