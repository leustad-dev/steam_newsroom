import type { NewsResult } from './news';
import { REFRESH_MS } from './session';

export const RETENTION_MS = 14 * 86400000;
export interface SavedHistory { key: string; result: NewsResult; expires: number }
// Keys isolate account/game/window; stale data remains usable during refresh failures.
export class HistoryCache {
  private entries = new Map<string, { result: NewsResult; expires: number }>();
  onChange?: () => void;
  get(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= now) return;
    return entry.result;
  }
  peek(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    return entry && entry.expires + RETENTION_MS > now ? entry.result : undefined;
  }
  set(key: string, result: NewsResult, now = Date.now()) {
    this.entries.delete(key);
    this.entries.set(key, { result, expires: now + REFRESH_MS });
    while (this.entries.size > 16) this.entries.delete(this.entries.keys().next().value!);
    this.onChange?.();
  }
  delete(key: string) { this.entries.delete(key); this.onChange?.(); }
  saved(accountId: string, ids: Set<string>, now = Date.now()): SavedHistory[] {
    return [...this.entries].filter(([key, entry]) => key.split(':')[0] === accountId
      && ids.has(key.split(':')[1]) && entry.expires + RETENTION_MS > now)
      .map(([key, entry]) => ({ key, ...entry }));
  }
  restore(entries: SavedHistory[]) {
    this.entries.clear();
    entries.slice(-16).forEach(({ key, ...entry }) => this.entries.set(key, entry));
  }
}
