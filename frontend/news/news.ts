import type { LibraryGame } from '../library/steamLibrary';
import { contentText, parseContent } from './formatting';

export const WEEK_SECONDS = 7 * 24 * 60 * 60;
export const PAGE_SIZE = 20;
export type SortOrder = 'name' | 'playtime' | 'news';
export type HistoryWindow = 7 | 30 | 90 | 0;
export const isHistoryWindow = (value: unknown): value is HistoryWindow =>
  value === 7 || value === 30 || value === 90 || value === 0;
export function restoreHistoryWindow(value: unknown): HistoryWindow {
  const restored = typeof value === 'string' && /^(0|7|30|90)$/.test(value) ? Number(value) : value;
  return isHistoryWindow(restored) ? restored : 7;
}

export interface NewsPost {
  id: string;
  title: string;
  publishedAt: number;
  text: string;
  content?: string;
  contentLimited?: boolean;
  url?: string;
}
export interface NewsResult {
  posts: NewsPost[];
  complete: boolean;
  nextBefore?: number;
  latestTimestamp?: number;
  warning?: string;
}
export interface GameNews extends NewsResult {
  status: 'ready' | 'error';
  error?: string;
}
export type NewsIndex = Record<string, GameNews>;
export type PageReader = (appId: string, before: number, signal: AbortSignal) => Promise<unknown>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

export function safeNewsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    const allowed = ['store.steampowered.com', 'steamcommunity.com', 'www.steamcommunity.com'];
    if (url.protocol === 'https:' && allowed.includes(url.hostname) && !url.username && !url.password) {
      return url.href;
    }
  } catch { /* Keep the post visible even if its link is invalid. */ }
}

export function plainText(value: string): string {
  return contentText(parseContent(value)).replace(/\n{3,}/g, '\n\n').trim();
}

export class NewsSourceError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

/** FFI may already decode JSON-looking Lua strings despite the generated string type. */
export function decodeNewsResponse(payload: unknown): Record<string, unknown> {
  let data: unknown = payload;
  if (typeof payload === 'string') {
    try { data = JSON.parse(payload); }
    catch { throw new Error('Steam news returned invalid JSON. Try Refresh news.'); }
  }
  const root = record(data);
  if (!root || Array.isArray(data)) throw new Error('Steam returned an unsupported news response.');
  if (typeof root?.error === 'string') {
    throw new NewsSourceError(root.error, typeof root.status === 'number' ? root.status : undefined);
  }
  return root;
}

export function parseNewsPage(payload: unknown, appId: string): NewsPost[] {
  const root = decodeNewsResponse(payload);
  const news = record(root?.appnews);
  if (!news || String(news.appid) !== appId || !Array.isArray(news.newsitems)) {
    throw new Error('Steam returned an unsupported news response.');
  }
  return news.newsitems.map(value => {
    const item = record(value);
    if (!item || typeof item.gid !== 'string' || !item.gid
      || typeof item.title !== 'string' || typeof item.contents !== 'string'
      || typeof item.date !== 'number' || !Number.isInteger(item.date) || item.date <= 0
      || String(item.appid) !== appId || item.feedname !== 'steam_community_announcements') {
      throw new Error('Steam returned an unsupported announcement.');
    }
    return {
      id: item.gid,
      title: plainText(item.title) || 'Untitled announcement',
      publishedAt: item.date,
      text: plainText(item.contents),
      content: item.contents.slice(0, 200000),
      contentLimited: item.contents.length > 200000,
      url: safeNewsUrl(item.url),
    };
  });
}

export function sortedPosts(posts: NewsPost[]): NewsPost[] {
  return [...posts].sort((a, b) => b.publishedAt - a.publishedAt || a.id.localeCompare(b.id));
}

export function withinWindow(posts: NewsPost[], since: number, now: number): NewsPost[] {
  return sortedPosts(posts.filter(post => post.publishedAt >= since && post.publishedAt <= now));
}

export async function loadNewsWindow(
  reader: PageReader, appId: string,
  options: { since: number; now: number; before?: number; maxPages?: number; signal: AbortSignal },
): Promise<NewsResult> {
  const posts = new Map<string, NewsPost>();
  let before = options.before ?? 0;
  let latestTimestamp: number | undefined;
  const result = (extra: Omit<NewsResult, 'posts' | 'latestTimestamp'>): NewsResult => ({
    posts: withinWindow([...posts.values()], options.since, options.now), latestTimestamp, ...extra,
  });
  for (let page = 0; page < (options.maxPages ?? 4); page++) {
    options.signal.throwIfAborted();
    const batch = parseNewsPage(await reader(appId, before, options.signal), appId);
    options.signal.throwIfAborted();
    if (!batch.length) return result({ complete: true });
    for (const post of batch) {
      posts.set(post.id, post);
      if (post.publishedAt <= options.now) latestTimestamp = Math.max(latestTimestamp ?? 0, post.publishedAt);
    }
    const oldest = Math.min(...batch.map(post => post.publishedAt));
    if (batch.length < PAGE_SIZE || oldest < options.since) return result({ complete: true });
    // Overlap the boundary second so equal-time posts are not silently skipped.
    const next = oldest + 1;
    if (before !== 0 && next >= before) {
      return result({ complete: false, warning: 'Steam pagination did not advance. More posts may exist at the boundary.' });
    }
    before = next;
  }
  return result({ complete: false, nextBefore: before, warning: 'More history is available; load older posts to continue.' });
}

export function sortGames(games: LibraryGame[], order: SortOrder, news: NewsIndex): LibraryGame[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return [...games].sort((a, b) => {
    if (order === 'playtime') {
      const difference = (b.playtimeMinutes ?? -1) - (a.playtimeMinutes ?? -1);
      if (difference) return difference;
    }
    if (order === 'news') {
      const difference = (news[b.appId]?.latestTimestamp ?? -1) - (news[a.appId]?.latestTimestamp ?? -1);
      if (difference) return difference;
    }
    return collator.compare(a.name, b.name) || Number(a.appId) - Number(b.appId);
  });
}

export function weeklyGroups(games: LibraryGame[], news: NewsIndex, now: number, order: SortOrder) {
  return sortGames(games, order, news).flatMap(game => {
    const entry = news[game.appId];
    const posts = withinWindow(entry?.posts ?? [], now - WEEK_SECONDS, now);
    return posts.length ? [{ game, posts, entry }] : [];
  });
}
