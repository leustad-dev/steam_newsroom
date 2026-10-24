import { plainText, safeNewsUrl, sortedPosts, type GameNews, type NewsIndex, type NewsPost, type NewsResult } from './news';
import { RETENTION_MS, type SavedHistory } from './historyCache';

export const DISK_LIMIT = 16 * 1024 * 1024;
const bytes = (value: string) => new TextEncoder().encode(value).length;
export interface SavedCache {
  version: 1; accountId: string; savedAt: number; nextRefreshAt: number;
  completed: number; total: number; paused: boolean; interrupted: boolean;
  news: NewsIndex; histories: SavedHistory[];
}
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function readResult(value: unknown): NewsResult {
  const result = object(value);
  if (!result || !Array.isArray(result.posts) || result.posts.length > 5000 || typeof result.complete !== 'boolean') throw Error('Invalid saved posts');
  const posts: NewsPost[] = result.posts.map(value => {
    const post = object(value);
    if (!post || typeof post.id !== 'string' || !post.id || post.id.length > 128
      || typeof post.title !== 'string' || post.title.length > 10000 || !number(post.publishedAt)
      || typeof post.text !== 'string' || post.text.length > 400000
      || post.content !== undefined && (typeof post.content !== 'string' || post.content.length > 200000)) throw Error('Invalid saved post');
    return { id: post.id, title: plainText(post.title), publishedAt: post.publishedAt,
      text: plainText(post.text), content: typeof post.content === 'string' ? post.content : undefined,
      contentLimited: post.contentLimited === true, url: safeNewsUrl(post.url) };
  });
  return { posts: sortedPosts(posts), complete: result.complete,
    nextBefore: number(result.nextBefore) && result.nextBefore <= 0xffffffff ? result.nextBefore : undefined,
    latestTimestamp: number(result.latestTimestamp) ? result.latestTimestamp : undefined,
    warning: typeof result.warning === 'string' ? result.warning.slice(0, 2000) : undefined };
}

/** Unknown files/FFI values are validated before they reach the live cache. */
export function decodeSavedCache(payload: unknown, accountId: string, ids: Set<string>, now: number): SavedCache | undefined {
  if (typeof payload === 'string') {
    if (bytes(payload) > DISK_LIMIT) throw Error('Saved cache is too large');
    payload = JSON.parse(payload);
  }
  const data = object(payload);
  if (data?.missing === true) return;
  if (typeof data?.error === 'string') throw Error(data.error);
  if (!data || data.version !== 1) throw Error('Saved news uses an unsupported format');
  if (data.accountId !== accountId) return;
  if (!number(data.savedAt) || data.savedAt > now + 60000 || now - data.savedAt > RETENTION_MS) return;
  if (!number(data.nextRefreshAt) || !number(data.completed) || !number(data.total)
    || data.completed > data.total || typeof data.paused !== 'boolean' || typeof data.interrupted !== 'boolean'
    || !object(data.news) || !Array.isArray(data.histories) || data.histories.length > 16) throw Error('Invalid saved news');
  const news: NewsIndex = {};
  for (const [id, value] of Object.entries(data.news as Record<string, unknown>)) {
    if (!ids.has(id)) continue;
    const entry = object(value);
    if (!entry || !['ready', 'error'].includes(String(entry.status))) throw Error('Invalid saved coverage');
    news[id] = { ...readResult(value), status: entry.status as GameNews['status'],
      error: typeof entry.error === 'string' ? entry.error.slice(0, 2000) : undefined };
  }
  const histories: SavedHistory[] = [];
  for (const value of data.histories) {
    const entry = object(value);
    if (!entry || typeof entry.key !== 'string' || !number(entry.expires)) throw Error('Invalid saved history');
    const [account, id, days, extra] = entry.key.split(':');
    if (account !== accountId || !ids.has(id) || !/^(0|7|30|90)$/.test(days) || extra !== undefined) continue;
    if (entry.expires + RETENTION_MS <= now) continue;
    histories.push({ key: entry.key, expires: Math.min(entry.expires, data.savedAt + 900000), result: readResult(entry.result) });
  }
  return { version: 1, accountId, savedAt: data.savedAt, nextRefreshAt: Math.min(data.nextRefreshAt, data.savedAt + 900000),
    completed: Math.min(data.completed, Object.keys(news).length), total: ids.size,
    paused: data.paused, interrupted: data.interrupted, news, histories };
}

export interface CacheTransport { read(): Promise<unknown>; write(payload: string): Promise<unknown>; clear(): Promise<unknown> }
function assertSuccess(payload: unknown) {
  const result = object(typeof payload === 'string' ? JSON.parse(payload) : payload);
  if (result?.ok !== true) throw Error(typeof result?.error === 'string' ? result.error : 'Saved news storage is unavailable.');
}

/** One writer, coalesced checkpoints, and a hard size bound. */
export class DiskCache {
  warning = '';
  onWarning?: () => void;
  private pending?: SavedCache;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  constructor(private transport: CacheTransport) {}
  private warn(message: string) { this.warning = message; this.onWarning?.(); }
  async load(account: string, ids: Set<string>, now: number) {
    try { return decodeSavedCache(await this.transport.read(), account, ids, now); }
    catch { this.warn('Saved news could not be restored. Refreshing from Steam.'); }
  }
  queue(snapshot: SavedCache, immediate = false) {
    this.pending = snapshot;
    if (immediate) { void this.flush(); return; }
    this.timer ??= setTimeout(() => { this.timer = undefined; void this.flush(); }, 2000);
  }
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.running) return this.running;
    this.running = this.drain().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async drain() {
    while (this.pending) {
      const snapshot = this.pending; this.pending = undefined;
      // Trim oldest opened histories first, then largest game entries if necessary.
      const compact = { ...snapshot, histories: [...snapshot.histories], news: { ...snapshot.news } };
      let payload = JSON.stringify(compact);
      const largest = Object.keys(compact.news).sort((a, b) => JSON.stringify(compact.news[b]).length - JSON.stringify(compact.news[a]).length);
      while (bytes(payload) > DISK_LIMIT && (compact.histories.length || largest.length)) {
        if (compact.histories.length) compact.histories.shift();
        else { delete compact.news[largest.shift()!]; compact.interrupted = true; }
        compact.completed = Math.min(compact.completed, Object.keys(compact.news).length);
        payload = JSON.stringify(compact);
      }
      try { assertSuccess(await this.transport.write(payload)); this.warn(''); }
      catch { this.warn('News could not be saved for next time. Current news is still available.'); }
    }
  }
  async clear() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.pending = undefined;
    await this.running;
    try { assertSuccess(await this.transport.clear()); this.warn(''); return true; }
    catch { this.warn('Saved news could not be cleared.'); return false; }
  }
}
