const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IgnoredSession } = require('../.test-build/ignored/ignored');
const { NewsroomSession } = require('../.test-build/news/session');
const { FavoritesSession } = require('../.test-build/favorites/favorites');
const account = '76561198000000001';
const game = { appId: '570', name: 'Example' };
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const page = id => ({ appnews: { appid: Number(id), newsitems: [] } });
const host = () => ({ App: { m_CurrentUser: { strSteamID: account } }, appStore: { m_bIsInitialized: true,
  allApps: [570, 42, 43].map(appid => ({ appid, app_type: 1, display_name: `Game ${appid}`, BIsOwned: () => true, BIsBorrowed: () => false })) } });
function storage() {
  const values = new Map();
  return { values, read: async id => values.get(id), write: async (id, value) => { values.set(id, value); } };
}
test('Ignored membership survives restart, remains separate per account, and supports removal', async () => {
  const disk = storage(); const first = new IgnoredSession(disk, () => true);
  first.setAccount(account); await flush(); first.add(game); await flush();
  const second = new IgnoredSession(disk, () => true); second.setAccount(account); await flush(); assert.deepEqual(second.games, [game]);
  second.setAccount('other'); await flush(); assert.deepEqual(second.games, []);
  second.setAccount(account); await flush(); second.remove(game.appId); await flush();
  const third = new IgnoredSession(disk, () => true); third.setAccount(account); await flush(); assert.deepEqual(third.games, []);
});
test('Favorited games cannot be ignored even through direct service calls', async () => {
  let favorite = true;
  const ignored = new IgnoredSession(storage(), () => !favorite); ignored.setAccount(account); await flush();
  assert.throws(() => ignored.add(game), /Remove this game from Favorites/); assert.deepEqual(ignored.games, []);
  favorite = false; ignored.add(game); assert.deepEqual(ignored.games, [game]);
});
test('Ignored entries are excluded consistently from library, favorites and search candidates', async () => {
  const ignored = new IgnoredSession(storage(), () => true); ignored.setAccount(account);
  assert.deepEqual(ignored.visible([game]), []); await flush(); ignored.add(game);
  for (const candidates of [[game], [game, { appId: '42', name: 'Other' }]]) assert.equal(ignored.visible(candidates).some(item => item.appId === '570'), false);
  ignored.remove('570'); assert.deepEqual(ignored.visible([game]), [game]);
});
test('Ignored games cannot be added as favorites until unignored', async () => {
  const ignored = new IgnoredSession(storage(), () => true); ignored.setAccount(account); await flush(); ignored.add(game);
  const favorites = new FavoritesSession(storage(), async id => page(id), Date.now, id => !ignored.has(id));
  favorites.setAccount(account); await flush(); assert.throws(() => favorites.add(game), /Unignore/);
  ignored.remove('570'); favorites.add(game); assert.deepEqual(favorites.games, [game]);
});
test('Corrupt ignore restore blocks editing and news eligibility until a retry succeeds', async () => {
  const disk = storage(); disk.values.set(account, '{bad'); const ignored = new IgnoredSession(disk, () => true);
  ignored.setAccount(account); await flush(); assert.equal(ignored.ready, false); assert.match(ignored.warning, /restored/); assert.throws(() => ignored.add(game), /restoring/);
  disk.values.set(account, JSON.stringify({ version: 1, games: [game] })); await ignored.restore(); assert.equal(ignored.ready, true); assert.deepEqual(ignored.games, [game]);
});
test('Late ignore restore cannot expose the previous account', async () => {
  const disk = storage(); let resolve; disk.read = id => id === account ? new Promise(done => { resolve = done; }) : Promise.resolve(undefined);
  const ignored = new IgnoredSession(disk, () => true); ignored.setAccount(account); await flush(); ignored.setAccount('other'); await flush();
  resolve(JSON.stringify({ version: 1, games: [game] })); await flush(); assert.deepEqual(ignored.games, []);
});
test('Ignore writes serialize rapid edits and show/retry a persistence failure', async () => {
  const disk = storage(); let fail = true, active = 0, max = 0;
  disk.write = async (id, value) => { max = Math.max(max, ++active); await new Promise(resolve => setImmediate(resolve)); active--; if (fail) throw Error('denied'); disk.values.set(id, value); };
  const ignored = new IgnoredSession(disk, () => true); ignored.setAccount(account); await flush(); ignored.add(game); ignored.remove('570'); ignored.add(game); await flush();
  assert.match(ignored.warning, /saved/); assert.equal(max, 1); fail = false; ignored.retrySave(); await flush(); assert.equal(ignored.warning, ''); assert.deepEqual(JSON.parse(disk.values.get(account)).games, [game]);
});
test('News waits for ignore restore and never requests excluded games on automatic/manual cycles', async () => {
  const calls = [];
  const session = new NewsroomSession(host, async id => { calls.push(id); return page(id); }, () => {}, Date.now, undefined, undefined, true);
  session.tick(); await flush(); assert.deepEqual(calls, []);
  session.setIgnored(account, new Set(['570']), true); await flush(); assert.deepEqual(new Set(calls), new Set(['42', '43']));
  session.refreshNews(); await flush(); assert.equal(calls.includes('570'), false); assert.equal(session.total, 2); assert.equal(session.library.snapshot.games.length, 3); session.dispose();
});
test('Ignoring cancels active work, drops cached news and suppresses late responses', async () => {
  let resolve;
  const session = new NewsroomSession(host, id => id === '570' ? new Promise(done => { resolve = done; }) : Promise.resolve(page(id)), () => {});
  session.tick(); await flush(); session.setIgnored(account, new Set(['570']), true); resolve(page('570')); await flush();
  assert.equal(session.news['570'], undefined); assert.equal(session.scanning, false); assert.equal(session.total, 2); session.dispose();
});
test('Unignore invalidates the game cache and prioritizes an immediate news check', async () => {
  const calls = [], invalidated = [];
  const session = new NewsroomSession(host, async id => { calls.push(id); return page(id); }, id => invalidated.push(id), Date.now, undefined, undefined, true);
  session.tick(); session.setIgnored(account, new Set(['570']), true); await flush(); calls.length = 0;
  session.setIgnored(account, new Set(), true); await flush();
  assert.equal(calls[0], '570'); assert.equal(invalidated.includes('570'), true); assert.equal(session.news['570'].status, 'ready'); session.dispose();
});
test('Ignore preferences are account-bound and cannot suppress a different account scan', async () => {
  const calls = [];
  const session = new NewsroomSession(host, async id => { calls.push(id); return page(id); }, () => {}, Date.now, undefined, undefined, true);
  session.tick(); session.setIgnored('other', new Set(['570']), true); await flush(); assert.deepEqual(calls, []);
  session.setIgnored(account, new Set(), true); await flush(); assert.equal(calls.includes('570'), true); session.dispose();
});
test('Favorites news also waits for ignore readiness instead of fetching during restore', async () => {
  let ready = false, calls = 0;
  const disk = storage(); disk.values.set(account, JSON.stringify({ version: 1, games: [game] }));
  const favorites = new FavoritesSession(disk, async id => { calls++; return page(id); }, Date.now, () => true, () => ready);
  favorites.setAccount(account); await flush(); assert.equal(calls, 0);
  ready = true; favorites.tick(); await flush(); assert.equal(calls, 1); favorites.dispose();
});
test('Fresh disk news restores without refetching or reviving ignored games', async () => {
  const now = Date.now(); let calls = 0;
  const disk = { load: async () => ({ news: Object.fromEntries(['570','42','43'].map(id => [id, { status: 'ready', complete: true, posts: [] }])), completed: 3, total: 3, paused: false, interrupted: false, nextRefreshAt: now + 900000, histories: [] }), queue() {} };
  const session = new NewsroomSession(host, async id => { calls++; return page(id); }, () => {}, () => now, disk, undefined, true);
  session.tick(); await flush(); session.setIgnored(account, new Set(['570']), true); await flush();
  assert.equal(calls, 0); assert.equal(session.news['570'], undefined); assert.equal(session.news['42'].status, 'ready'); session.dispose();
});
test('Ignore changes during disk restore are applied before publishing cached posts', async () => {
  const now = Date.now(); let release, calls = 0;
  const disk = { load: () => new Promise(resolve => { release = resolve; }), queue() {} };
  const session = new NewsroomSession(host, async id => { calls++; return page(id); }, () => {}, () => now, disk, undefined, true);
  session.tick(); session.setIgnored(account, new Set(['570']), true);
  release({ news: Object.fromEntries(['570','42','43'].map(id => [id, { status: 'ready', complete: true, posts: [] }])), completed: 3, total: 3, paused: false, interrupted: false, nextRefreshAt: now + 900000, histories: [] });
  await flush(); assert.equal(calls, 0); assert.equal(session.news['570'], undefined); session.dispose();
});
test('Saved-list conflicts favor Favorites and persist removal from Ignore', async () => {
  const disk = storage(); disk.values.set(account, JSON.stringify({ version: 1, games: [game] }));
  const ignored = new IgnoredSession(disk, () => false); ignored.setAccount(account); await flush();
  ignored.protectFavorites(new Set(['570'])); await flush(); assert.deepEqual(ignored.games, []);
  assert.deepEqual(JSON.parse(disk.values.get(account)).games, []);
});
