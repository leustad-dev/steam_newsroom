import type { LibraryGame } from '../library/steamLibrary';
import { artworkCandidates } from '../library/artwork';
import { decodeNewsResponse, loadNewsWindow, WEEK_SECONDS, sortedPosts, sortGames, type SortOrder, type NewsIndex, type PageReader } from '../news/news';

export interface Favorite { appId: string; name: string }
export const FAVORITE_LIMIT = 500;
export function validAppId(id: unknown): id is string {
  return typeof id === 'string' && /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 0xffffffff;
}
export function parseFavorites(value: unknown): Favorite[] {
  if (value === undefined || value === null || value === '') return [];
  const root = typeof value === 'string' ? JSON.parse(value) : value;
  if (!root || root.version !== 1 || !Array.isArray(root.games) || root.games.length > FAVORITE_LIMIT) throw Error('Unsupported saved Favorites.');
  const result = new Map<string, Favorite>();
  for (const item of root.games) {
    if (!item || !validAppId(item.appId) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 300) throw Error('Invalid saved favorite.');
    result.set(item.appId, { appId: item.appId, name: item.name.trim() });
  }
  return [...result.values()];
}
export function favoriteGames(favorites: Favorite[], library: LibraryGame[]): LibraryGame[] {
  const owned = new Map(library.map(game => [game.appId, game]));
  return favorites.map(item => owned.get(item.appId) ?? {
    ...item, installation: 'not-installed', playtimeMinutes: null,
    artworkUrl: artworkCandidates(item.appId)[0], artworkUrls: artworkCandidates(item.appId),
  });
}
export function favoriteGroups(games: LibraryGame[], news: NewsIndex, now: number, order: SortOrder) {
  return sortGames(games, order, news).map(game => ({ game, entry: news[game.appId],
    posts: sortedPosts(news[game.appId]?.posts ?? []).filter(post => post.publishedAt >= now - WEEK_SECONDS && post.publishedAt <= now),
  }));
}
export function searchResults(payload: unknown): Favorite[] {
  const root = decodeNewsResponse(payload);
  if (!Array.isArray(root.items)) throw Error('Steam returned an unsupported search response.');
  const items = new Map<string, Favorite>();
  for (const item of root.items.slice(0, 50)) {
    if (!item || item.type !== 'app') continue;
    const id = typeof item.id === 'number' && Number.isInteger(item.id) ? String(item.id) : item.id;
    if (validAppId(id) && typeof item.name === 'string' && item.name.trim() && item.name.length <= 300) items.set(id, { appId: id, name: item.name.trim() });
  }
  return [...items.values()];
}
export function confirmedGame(payload: unknown, appId: string): Favorite {
  const root = decodeNewsResponse(payload);
  const raw = root[appId];
  const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined;
  const data = item?.data && typeof item.data === 'object' ? item.data as Record<string, unknown> : undefined;
  if (!validAppId(appId) || item?.success !== true || data?.type !== 'game'
    || String(data.steam_appid) !== appId || typeof data.name !== 'string'
    || !data.name.trim() || data.name.length > 300) throw Error('Only available Steam base games can be added. This item may be DLC, a soundtrack, or unavailable.');
  return { appId, name: data.name.trim() };
}
interface Storage {
  read(accountId: string): Promise<unknown>;
  write(accountId: string, payload: string): Promise<unknown>;
}
/** Plugin-lifetime account-scoped list; independent of the disposable news cache. */
export class FavoritesSession {
  accountId?: string;
  games: Favorite[] = [];
  news: NewsIndex = {};
  ready = false;
  loading = false;
  scanning = false;
  warning = '';
  nextRefreshAt = 0;
  private epoch = 0;
  private controller?: AbortController;
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private revision = 0;
  constructor(private storage: Storage, private reader: PageReader, private clock = Date.now, private allowed: (id: string) => boolean = () => true, private scanReady: () => boolean = () => true) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  setAccount(accountId?: string) {
    if (this.accountId === accountId) return;
    this.controller?.abort(); ++this.epoch;
    this.accountId = accountId; this.games = []; this.news = {}; this.ready = false;
    this.loading = false; this.scanning = false; this.warning = ''; this.nextRefreshAt = 0;
    this.emit();
    if (accountId) void this.restore();
  }
  restore = async () => {
    if (!this.accountId || this.loading || this.ready) return;
    const account = this.accountId, epoch = this.epoch;
    this.loading = true; this.emit();
    try {
      // A fast account switch back must not read before its pending writes commit.
      await this.writes;
      const value = await this.storage.read(account);
      if (epoch !== this.epoch) return;
      this.games = parseFavorites(value); this.ready = true; this.warning = '';
    } catch {
      if (epoch === this.epoch) this.warning = 'Favorites could not be restored. Retry before editing to protect the saved list.';
    } finally {
      if (epoch === this.epoch) { this.loading = false; this.emit(); this.tick(); }
    }
  };
  add(game: Favorite) {
    if (!this.allowed(game.appId)) throw Error('Unignore this game before adding it to Favorites.');
    if (!this.ready) throw Error('Wait for Favorites to finish restoring.');
    if (!validAppId(game.appId) || !game.name.trim() || game.name.length > 300) throw Error('Invalid game.');
    if (this.games.some(item => item.appId === game.appId)) return;
    if (this.games.length >= FAVORITE_LIMIT) throw Error('Favorites is limited to 500 games.');
    this.games = [...this.games, { appId: game.appId, name: game.name.trim() }];
    this.save(); this.restart();
  }
  toggle(game: Favorite) {
    if (this.games.some(item => item.appId === game.appId)) this.remove(game.appId);
    else this.add(game);
  }
  remove(appId: string) {
    if (!this.ready) return;
    this.games = this.games.filter(game => game.appId !== appId);
    delete this.news[appId]; this.save(); this.restart();
  }
  retrySave = () => { if (this.ready) this.save(); };
  private save() {
    const account = this.accountId!, epoch = this.epoch, revision = ++this.revision;
    const payload = JSON.stringify({ version: 1, games: this.games });
    this.writes = this.writes.then(async () => {
      try {
        await this.storage.write(account, payload);
        if (epoch === this.epoch && revision === this.revision) this.warning = '';
      } catch {
        if (epoch === this.epoch) this.warning = 'Favorites could not be saved. Retry saving before closing Steam.';
      }
      this.emit();
    });
    this.emit();
  }
  private restart() { this.controller?.abort(); this.scanning = false; this.nextRefreshAt = 0; this.emit(); this.tick(); }
  tick = () => { if (this.scanReady() && this.ready && !this.scanning && this.clock() >= this.nextRefreshAt) void this.refresh(); };
  refresh = async () => {
    if (!this.scanReady() || !this.ready || this.scanning) return;
    const controller = new AbortController(); this.controller = controller;
    const games = this.games.filter(game => this.allowed(game.appId)), now = Math.floor(this.clock() / 1000);
    this.scanning = true; this.nextRefreshAt = this.clock() + 15 * 60000; this.emit();
    let index = 0;
    const worker = async () => {
      while (!controller.signal.aborted && index < games.length) {
        const { appId } = games[index++];
        try {
          const result = await loadNewsWindow(this.reader, appId, { since: now - WEEK_SECONDS, now, signal: controller.signal });
          if (controller.signal.aborted) return;
          this.news = { ...this.news, [appId]: { ...result, status: 'ready' } };
        } catch (error) {
          if (controller.signal.aborted) return;
          this.news = { ...this.news, [appId]: { status: 'error', posts: this.news[appId]?.posts ?? [], complete: false,
            error: error instanceof Error ? error.message : 'Could not check news.' } };
        }
        this.emit();
        // Do not hammer a failing source across a large watchlist.
        if (this.news[appId]?.status === 'error') {
          for (const game of games.slice(index)) this.news[game.appId] = { ...this.news[game.appId], posts: this.news[game.appId]?.posts ?? [], status: 'error', complete: false, error: 'Not checked after a source error. Use Refresh to retry.' };
          index = games.length;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (!controller.signal.aborted) { this.scanning = false; this.emit(); }
  };
  dispose() { this.controller?.abort(); ++this.epoch; this.listeners.clear(); this.accountId = undefined; this.games = []; this.news = {}; this.ready = false; }
}
