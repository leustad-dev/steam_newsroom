import { readLibraryState, type LibraryState, type LibrarySnapshot } from '../library/steamLibrary';
import { loadNewsWindow, NewsSourceError, WEEK_SECONDS, type NewsIndex, type PageReader } from './news';
import type { DiskCache } from './persistence';
import type { HistoryCache } from './historyCache';

export const REFRESH_MS = 15 * 60 * 1000;
export class NewsroomSession {
  library: LibraryState = { status: 'loading' };
  news: NewsIndex = {};
  completed = 0;
  total = 0;
  scanning = false;
  paused = false;
  restoring = false;
  restored = false;
  clearing = false;
  nextRefreshAt = 0;
  private ignoredIds = new Set<string>();
  private ignoreReady: boolean;
  private membership = '';
  private accountId?: string;
  private controller?: AbortController;
  private listeners = new Set<() => void>();
  private waitingSince?: number;
  private generation = 0;
  private blockedPersistence = false;
  constructor(private host: () => unknown, private reader: PageReader,
    private invalidate: (appId?: string) => void, private clock = Date.now,
    private disk?: DiskCache, private histories?: HistoryCache, private waitForIgnored = false) {
    this.ignoreReady = !waitForIgnored;
    if (disk) disk.onWarning = () => this.emit();
    if (histories) histories.onChange = () => this.persist(true);
  }
  get storageWarning() { return this.disk?.warning ?? ''; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  refreshLibrary = () => {
    this.library = readLibraryState(this.host(), this.library.snapshot, this.clock());
    if (this.library.status === 'loading') {
      this.waitingSince ??= this.clock();
      if (this.clock() - this.waitingSince >= 15000) this.library = {
        status: 'error', message: 'Steam has not made the full library available yet. Open the Library and try Refresh library.',
        snapshot: this.library.snapshot,
      };
    } else this.waitingSince = undefined;
    const snapshot = this.library.snapshot;
    const account = snapshot?.accountId;
    const membership = snapshot?.games.map(game => game.appId).sort().join(',') ?? '';
    const changedAccount = account !== this.accountId;
    if (changedAccount || membership !== this.membership) {
      const generation = ++this.generation;
      this.controller?.abort();
      this.scanning = false;
      this.accountId = account;
      this.membership = membership;
      if (changedAccount) {
        this.ignoredIds = new Set(); this.ignoreReady = !this.waitForIgnored;
        this.news = {}; this.completed = 0; this.total = 0; this.nextRefreshAt = 0; this.paused = false;
        this.restored = false; this.histories?.restore([]);
      }
      this.restoring = false;
      if (snapshot && changedAccount && this.disk) void this.restore(snapshot, generation);
      else if (snapshot && this.ignoreReady) void this.scan(snapshot);
    }
    this.emit();
  };
  tick = () => {
    this.refreshLibrary();
    if (!this.restoring && !this.scanning && this.library.snapshot && this.clock() >= this.nextRefreshAt) this.refreshNews();
    this.emit();
  };
  refreshNews = () => {
    if (!this.ignoreReady || this.restoring || this.scanning || this.clearing || !this.library.snapshot) return;
    this.blockedPersistence = false;
    this.invalidate();
    void this.scan(this.library.snapshot);
  };
  setIgnored(accountId: string, ids: ReadonlySet<string>, ready: boolean) {
    if (accountId !== this.accountId) return;
    const initial = !this.ignoreReady;
    const changed = ids.size !== this.ignoredIds.size || [...ids].some(id => !this.ignoredIds.has(id));
    if (!changed && ready === this.ignoreReady) return;
    this.controller?.abort(); this.scanning = false;
    const unignored = [...this.ignoredIds].filter(id => !ids.has(id));
    for (const id of unignored) this.invalidate(id);
    this.ignoredIds = new Set(ids); this.ignoreReady = ready;
    if (!ready) { this.emit(); return; }
    this.news = Object.fromEntries(Object.entries(this.news).filter(([id]) => !ids.has(id)));
    const snapshot = this.library.snapshot;
    this.total = snapshot?.games.filter(game => !ids.has(game.appId)).length ?? 0;
    this.completed = Math.min(this.completed, this.total);
    if (snapshot && !this.restoring && !this.clearing && (!initial || snapshot.games.some(game => !ids.has(game.appId) && !this.news[game.appId]) || this.clock() >= this.nextRefreshAt)) {
      void this.scan(snapshot, unignored);
    }
    this.emit(); this.persist(true);
  }
  private async restore(snapshot: LibrarySnapshot, generation: number) {
    this.restoring = true; this.emit();
    const saved = await this.disk!.load(snapshot.accountId, new Set(snapshot.games.map(game => game.appId)), this.clock());
    if (generation !== this.generation) return;
    this.restoring = false;
    if (saved) {
      this.news = Object.fromEntries(Object.entries(saved.news).filter(([id]) => !this.ignoredIds.has(id)));
      this.total = snapshot.games.filter(game => !this.ignoredIds.has(game.appId)).length;
      this.completed = Math.min(saved.completed, this.total);
      this.paused = saved.paused; this.nextRefreshAt = saved.nextRefreshAt;
      this.histories?.restore(saved.histories); this.restored = true;
    }
    this.emit();
    const missing = snapshot.games.some(game => !this.ignoredIds.has(game.appId) && !this.news[game.appId]);
    if (!saved || missing || saved.interrupted || this.clock() >= this.nextRefreshAt) this.refreshNews();
  }
  persist = (immediate = false) => {
    if (!this.disk || this.restoring || this.blockedPersistence || !this.accountId) return;
    const ids = new Set(this.membership ? this.membership.split(',') : []);
    this.disk.queue({ version: 1, accountId: this.accountId, savedAt: this.clock(), nextRefreshAt: this.nextRefreshAt,
      completed: this.completed, total: this.total, paused: this.paused, interrupted: this.scanning,
      news: this.news, histories: this.histories?.saved(this.accountId, ids, this.clock()) ?? [] }, immediate);
  };
  clearSavedNews = async () => {
    if (!this.disk || this.clearing) return;
    this.clearing = true;
    this.blockedPersistence = true;
    this.controller?.abort(); this.scanning = false;
    this.nextRefreshAt = this.clock() + REFRESH_MS;
    this.emit();
    await this.disk.clear();
    this.clearing = false;
    this.emit();
  };
  private async scan(snapshot: LibrarySnapshot, priority: string[] = []) {
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    if (!this.ignoreReady) return;
    const ids = snapshot.games.map(game => game.appId).filter(id => !this.ignoredIds.has(id)).sort((a, b) => Number(priority.includes(b)) - Number(priority.includes(a)));
    this.news = Object.fromEntries(Object.entries(this.news).filter(([id]) => ids.includes(id)));
    this.completed = 0; this.total = ids.length; this.scanning = true; this.paused = false;
    this.nextRefreshAt = this.clock() + REFRESH_MS;
    const now = Math.floor(this.clock() / 1000);
    this.emit();
    this.persist();
    let index = 0, failures = 0;
    const worker = async () => {
      while (!signal.aborted && !this.paused && index < ids.length) {
        const id = ids[index++];
        try {
          const result = await loadNewsWindow(this.reader, id, { since: now - WEEK_SECONDS, now, signal });
          if (signal.aborted) return;
          failures = 0;
          this.news = { ...this.news, [id]: { ...result, status: 'ready' } };
        } catch (error) {
          if (signal.aborted) return;
          failures++;
          if (failures >= 3 || error instanceof NewsSourceError && (error.status === 429 || error.status === 503)) this.paused = true;
          this.news = { ...this.news, [id]: {
            ...this.news[id], posts: this.news[id]?.posts ?? [], complete: false, status: 'error',
            error: error instanceof Error ? error.message : 'Could not load news.',
          } };
        }
        this.completed++; this.emit(); this.persist();
      }
    };
    await Promise.all([worker(), worker()]);
    if (signal.aborted) return;
    // Include unattempted games in the diagnostics; a paused scan is not coverage.
    for (const id of ids.slice(index)) this.news = { ...this.news, [id]: {
      ...this.news[id], posts: this.news[id]?.posts ?? [], complete: false, status: 'error',
      error: 'Not checked: scanning paused after source errors. Retry with Refresh news.',
    } };
    this.scanning = false;
    this.emit();
    this.persist(true);
  }
  dispose() {
    this.persist(true);
    ++this.generation;
    this.controller?.abort(); this.listeners.clear();
    this.library = { status: 'loading' }; this.news = {}; this.accountId = undefined;
    this.ignoredIds.clear(); this.ignoreReady = !this.waitForIgnored;
    this.membership = ''; this.scanning = false; this.completed = 0; this.total = 0;
    this.nextRefreshAt = 0; this.paused = false; this.restoring = false; this.restored = false; this.clearing = false;
  }
}

export function refreshCountdown(nextRefreshAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((nextRefreshAt - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
