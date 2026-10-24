import { useEffect, useState } from 'react';
import { pluginConfig } from 'millennium';
import { IgnoredSession } from '../ignored/ignored';
import { FavoritesSession } from '../favorites/favorites';
import { NewsroomSession } from './session';
import { invalidateNews, readNewsPage } from './transport';
import { DiskCache } from './persistence';
import { HistoryCache } from './historyCache';

function storageCall(call: () => Promise<unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(Error('Saved news storage timed out.')), 10000);
    void call().then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}
const disk = new DiskCache({
  read: () => storageCall(() => backend.read_cache()),
  write: payload => storageCall(() => backend.write_cache(payload)),
  clear: () => storageCall(() => backend.clear_cache()),
});
export const favorites: FavoritesSession = new FavoritesSession({
  read: account => storageCall(() => pluginConfig.get<unknown>(`favorites:v1:${account}`)),
  write: (account, payload) => storageCall(() => pluginConfig.set(`favorites:v1:${account}`, payload)),
}, readNewsPage, Date.now, id => ignored.ready && !ignored.has(id), () => ignored.ready);
export const ignored: IgnoredSession = new IgnoredSession({
  read: account => storageCall(() => pluginConfig.get<unknown>(`ignored:v1:${account}`)),
  write: (account, payload) => storageCall(() => pluginConfig.set(`ignored:v1:${account}`, payload)),
}, id => favorites.ready && !favorites.games.some(game => game.appId === id));
export function useIgnored() {
  const [, render] = useState(0);
  useEffect(() => ignored.subscribe(() => render(value => value + 1)), []);
  return ignored;
}
export function useFavorites() {
  const [, render] = useState(0);
  useEffect(() => favorites.subscribe(() => render(value => value + 1)), []);
  return favorites;
}
export const histories = new HistoryCache();

const session = new NewsroomSession(() => window, readNewsPage, invalidateNews, Date.now, disk, histories, true);
export function startNewsroomSession() {
  const syncFavorites = () => {
    const account = session.library.snapshot?.accountId;
    ignored.setAccount(account); favorites.setAccount(account);
  };
  const syncIgnored = () => {
    if (favorites.ready && favorites.accountId === ignored.accountId) ignored.protectFavorites(new Set(favorites.games.map(game => game.appId)));
    if (ignored.accountId) session.setIgnored(ignored.accountId, new Set(ignored.games.map(game => game.appId)), ignored.ready);
  };
  const stopIgnored = ignored.subscribe(syncIgnored);
  const stopProtection = favorites.subscribe(syncIgnored);
  const unsubscribe = session.subscribe(syncFavorites);
  const tick = () => { session.tick(); favorites.tick(); };
  tick();
  const timer = window.setInterval(tick, 1000);
  return () => { window.clearInterval(timer); unsubscribe(); stopIgnored(); stopProtection(); session.dispose(); favorites.dispose(); ignored.dispose(); };
}
export function useNewsroomSession() {
  const [, render] = useState(0);
  useEffect(() => session.subscribe(() => render(value => value + 1)), []);
  return session;
}
