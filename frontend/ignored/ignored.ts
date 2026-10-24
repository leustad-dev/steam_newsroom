import { parseFavorites, validAppId, type Favorite } from '../favorites/favorites';
interface Storage {
  read(accountId: string): Promise<unknown>;
  write(accountId: string, payload: string): Promise<unknown>;
}
/** Independent preferences, never cleared with cached news. */
export class IgnoredSession {
  accountId?: string;
  games: Favorite[] = [];
  ready = false;
  loading = false;
  warning = '';
  private epoch = 0;
  private revision = 0;
  private writes: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private storage: Storage, private canIgnore: (id: string) => boolean) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  visible<T extends { appId: string }>(games: T[]): T[] { return this.ready ? games.filter(game => !this.has(game.appId)) : []; }
  has(appId: string) { return this.games.some(game => game.appId === appId); }
  setAccount(accountId?: string) {
    if (accountId === this.accountId) return;
    ++this.epoch; this.accountId = accountId; this.games = []; this.ready = false; this.loading = false; this.warning = ''; this.emit();
    if (accountId) void this.restore();
  }
  restore = async () => {
    if (!this.accountId || this.loading || this.ready) return;
    const account = this.accountId, epoch = this.epoch;
    this.loading = true; this.emit();
    try {
      await this.writes;
      const value = await this.storage.read(account);
      if (epoch !== this.epoch) return;
      this.games = parseFavorites(value); this.ready = true; this.warning = '';
    } catch {
      if (epoch === this.epoch) this.warning = 'Ignored games could not be restored. Retry to resume news checks safely.';
    } finally {
      if (epoch === this.epoch) { this.loading = false; this.emit(); }
    }
  };
  add(game: Favorite) {
    if (!this.ready) throw Error('Wait for ignored games to finish restoring.');
    if (!this.canIgnore(game.appId)) throw Error('Remove this game from Favorites before ignoring it.');
    if (!validAppId(game.appId) || !game.name.trim() || game.name.length > 300) throw Error('Invalid game.');
    if (this.has(game.appId)) return;
    if (this.games.length >= 500) throw Error('The ignore list is limited to 500 games.');
    this.games = [...this.games, { appId: game.appId, name: game.name.trim() }]; this.save();
  }
  protectFavorites(ids: ReadonlySet<string>) {
    if (!this.ready) return;
    const games = this.games.filter(game => !ids.has(game.appId));
    if (games.length === this.games.length) return;
    this.games = games; this.save();
  }
  remove(appId: string) {
    if (!this.ready) return;
    this.games = this.games.filter(game => game.appId !== appId); this.save();
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
        if (epoch === this.epoch) this.warning = 'Ignored games could not be saved. Retry before closing Steam.';
      }
      this.emit();
    });
    this.emit();
  }
  dispose() { ++this.epoch; this.listeners.clear(); this.accountId = undefined; this.games = []; this.ready = false; }
}
