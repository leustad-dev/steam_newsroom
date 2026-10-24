import { useEffect, useRef, useState } from 'react';
import { pluginConfig } from 'millennium';
import { HistoryWindow, loadNewsWindow, NewsResult, restoreHistoryWindow, sortedPosts } from './news';
import { invalidateNews, readNewsPage } from './transport';
import { histories } from './useNewsroomSession';

const preferences = new Map<string, HistoryWindow>();

export function useHistoryPreference(accountId: string, appId: string) {
  const key = `history:${accountId}:${appId}`;
  const [days, setDays] = useState<HistoryWindow | undefined>(() => preferences.get(key));
  const [warning, setWarning] = useState('');
  const edited = useRef(false);
  useEffect(() => {
    if (preferences.has(key)) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled && !edited.current) { setDays(7); setWarning('Saved history settings are unavailable; using one week.'); }
    }, 8000);
    // Starlight injects the plugin ID into these calls at build time.
    void pluginConfig.get<unknown>(key).then(value => {
      if (!cancelled && !edited.current) {
        const restored = restoreHistoryWindow(value);
        preferences.set(key, restored); setDays(restored);
      }
    }).catch(() => {
      if (!cancelled && !edited.current) { setDays(7); setWarning('Could not restore the saved history window.'); }
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [key]);
  return {
    days, warning,
    changeDays(value: HistoryWindow) {
      edited.current = true;
      preferences.set(key, value);
      setDays(value);
      setWarning('');
      void pluginConfig.set(key, String(value)).catch(() => setWarning('This history window could not be saved for next time.'));
    },
  };
}

interface History {
  key: string;
  result?: NewsResult;
  loading: boolean;
  error?: string;
  now: number;
}

export function useGameHistory(accountId: string, appId: string, days: HistoryWindow | undefined, refreshAt: number) {
  const key = `${accountId}:${appId}:${days}`;
  const [history, setHistory] = useState<History>(() => ({ key, result: histories.peek(key), loading: false, now: Math.floor(Date.now() / 1000) }));
  const [revision, setRevision] = useState(0);
  const [more, setMore] = useState<{ key: string; before: number } | undefined>();
  const previousCycle = useRef(refreshAt);

  useEffect(() => {
    if (previousCycle.current === refreshAt) return;
    previousCycle.current = refreshAt;
    histories.delete(key);
    setMore(undefined);
    setRevision(value => value + 1);
  }, [refreshAt, key]);

  useEffect(() => { setMore(undefined); }, [key]);

  useEffect(() => {
    if (days === undefined) return;
    const cached = histories.get(key);
    if (cached && more?.key !== key) { setHistory({ key, result: cached, loading: false, now: Math.floor(Date.now() / 1000) }); return; }
    const controller = new AbortController();
    const before = more?.key === key ? more.before : 0;
    const now = Math.floor(Date.now() / 1000);
    setHistory(previous => ({ key, loading: true, now, result: previous.key === key ? previous.result ?? histories.peek(key) : histories.peek(key) }));
    void loadNewsWindow(readNewsPage, appId, {
      since: days === 0 ? 0 : now - days * 86400, now, before, signal: controller.signal,
    }).then(result => {
      if (controller.signal.aborted) return;
      setHistory(previous => {
        const posts = new Map((before && previous.key === key ? previous.result?.posts ?? [] : []).map(post => [post.id, post]));
        result.posts.forEach(post => posts.set(post.id, post));
        const combined = { ...result, posts: sortedPosts([...posts.values()]) };
        histories.set(key, combined);
        return { key, loading: false, now, result: combined };
      });
    }).catch(error => {
      if (!controller.signal.aborted) setHistory(previous => ({
        ...previous, loading: false, error: error instanceof Error ? error.message : 'Could not load news.',
      }));
    });
    return () => controller.abort();
  }, [key, appId, days, more, revision]);

  return {
    ...(history.key === key ? history : { key, loading: true, now: 0 }),
    loadMore() {
      if (history.result?.nextBefore) setMore({ key, before: history.result.nextBefore });
    },
    refresh() { histories.delete(key); invalidateNews(appId); setMore(undefined); setRevision(value => value + 1); },
  };
}
