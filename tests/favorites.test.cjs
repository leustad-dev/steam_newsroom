const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FavoritesSession, parseFavorites, favoriteGames, searchResults, confirmedGame } = require('../.test-build/favorites/favorites');
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const empty = async id => ({ appnews: { appid: Number(id), newsitems: [] } });
const game = { appId: '570', name: 'Example' };
function storage() {
  const values = new Map();
  return { values, read: async id => values.get(id), write: async (id, value) => { values.set(id, value); } };
}
test('Favorites persist additions/removals across fresh sessions and deduplicate by string AppID', async () => {
  const disk = storage(); const first = new FavoritesSession(disk, empty);
  first.setAccount('A'); await flush(); first.add(game); first.add(game); await flush();
  const second = new FavoritesSession(disk, empty); second.setAccount('A'); await flush();
  assert.deepEqual(second.games, [game]); second.remove(game.appId); await flush();
  const third = new FavoritesSession(disk, empty); third.setAccount('A'); await flush(); assert.deepEqual(third.games, []);
});
test('Favorites reject corrupt storage and block edits instead of replacing unread saved data', async () => {
  const disk = storage(); disk.values.set('A', '{bad json');
  const session = new FavoritesSession(disk, empty); session.setAccount('A'); await flush();
  assert.equal(session.ready, false); assert.match(session.warning, /restored/); assert.throws(() => session.add(game), /restoring/);
  assert.throws(() => parseFavorites({ version: 1, games: [{ appId: '9007199254740993', name: 'bad' }] }));
  assert.throws(() => parseFavorites({ version: 2, games: [] }));
});
test('Account switching suppresses late restore and isolates saved favorites', async () => {
  let resolveA;
  const disk = storage(); disk.read = id => id === 'A' ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve(undefined);
  const session = new FavoritesSession(disk, empty); session.setAccount('A'); await flush(); session.setAccount('B'); await flush();
  resolveA(JSON.stringify({ version: 1, games: [game] })); await flush(); assert.deepEqual(session.games, []);
  session.add({ appId: '42', name: 'Other' }); await flush(); assert.equal(disk.values.has('A'), false); assert.equal(JSON.parse(disk.values.get('B')).games[0].appId, '42');
});
test('Serialized writes preserve the latest favorite list during rapid edits', async () => {
  const disk = storage(); let active = 0, maximum = 0;
  disk.write = async (account, value) => { maximum = Math.max(maximum, ++active); await new Promise(resolve => setImmediate(resolve)); disk.values.set(account, value); active--; };
  const session = new FavoritesSession(disk, empty); session.setAccount('A'); await flush();
  session.add(game); session.add({ appId: '42', name: 'Other' }); session.remove('570'); await flush();
  assert.equal(maximum, 1); assert.deepEqual(JSON.parse(disk.values.get('A')).games, [{ appId: '42', name: 'Other' }]);
});
test('Failed Favorites writes stay visible and can be retried', async () => {
  const disk = storage(); const write = disk.write; disk.write = async () => { throw Error('offline'); };
  const session = new FavoritesSession(disk, empty); session.setAccount('A'); await flush(); session.add(game); await flush();
  assert.match(session.warning, /saved/); assert.deepEqual(session.games, [game]); disk.write = write; session.retrySave(); await flush(); assert.equal(session.warning, '');
});
test('Quiet and unowned Favorites remain visible without changing library membership', () => {
  const library = [{ ...game, installation: 'installed', playtimeMinutes: 120, artworkUrl: 'local' }];
  const before = JSON.stringify(library); const favorites = favoriteGames([game, { appId: '42', name: 'Unowned' }], library);
  assert.equal(favorites.length, 2); assert.equal(favorites[0], library[0]); assert.equal(favorites[1].installation, 'not-installed'); assert.equal(JSON.stringify(library), before);
});
test('Favorites weekly polling retains quiet games and follows the 15-minute cycle', async () => {
  let now = 1700000000000, calls = 0;
  const session = new FavoritesSession(storage(), async id => { calls++; return empty(id); }, () => now);
  session.setAccount('A'); await flush(); session.add(game); await flush(); assert.equal(calls, 1); assert.equal(session.news['570'].posts.length, 0); assert.equal(session.games.length, 1);
  now += 899999; session.tick(); await flush(); assert.equal(calls, 1); now++; session.tick(); await flush(); assert.equal(calls, 2);
});
test('Removing a favorite cancels late news so deleted items cannot reappear', async () => {
  let release; const session = new FavoritesSession(storage(), () => new Promise(resolve => { release = resolve; }));
  session.setAccount('A'); await flush(); session.add(game); await flush(); session.remove('570'); release(await empty('570')); await flush();
  assert.deepEqual(session.games, []); assert.equal(session.news['570'], undefined);
});
test('Store search accepts decoded/text payloads, rejects packages and invalid identifiers', () => {
  const payload = { items: [{ id: 570, type: 'app', name: 'Example' }, { id: 570, type: 'app', name: 'Example' }, { id: 2, type: 'sub', name: 'Package' }, { id: -2, type: 'app', name: 'Invalid' }] };
  assert.deepEqual(searchResults(payload), [game]); assert.deepEqual(searchResults(JSON.stringify(payload)), [game]); assert.throws(() => searchResults({ error: 'Search failed' }), /Search failed/);
});
test('Adding a search result verifies the matching base game and rejects DLC/soundtracks', () => {
  const payload = { '570': { success: true, data: { steam_appid: 570, name: 'Example', type: 'game' } } };
  assert.deepEqual(confirmedGame(payload, '570'), game);
  payload['570'].data.type = 'dlc'; assert.throws(() => confirmedGame(payload, '570'), /base games/);
  payload['570'].data.type = 'game'; payload['570'].data.steam_appid = 42; assert.throws(() => confirmedGame(payload, '570'), /base games/);
});
test('Favorites keep quiet games while filtering posts to seven days, newest first', () => {
  const { favoriteGroups } = require('../.test-build/favorites/favorites');
  const games = favoriteGames([game, { appId: '42', name: 'Quiet' }], []);
  const now = 1700000000;
  const post = (id, publishedAt) => ({ id, publishedAt, title: id, text: '' });
  const news = { '570': { status: 'ready', complete: true, posts: [post('old', now - 604801), post('boundary', now - 604800), post('newest', now), post('future', now + 1)] } };
  const groups = favoriteGroups(games, news, now, 'name');
  assert.equal(groups.length, 2); assert.deepEqual(groups[0].posts.map(item => item.id), ['newest', 'boundary']); assert.deepEqual(groups[1].posts, []);
});
test('Account changes cancel late Favorites news and do not expose previous posts', async () => {
  let release; const session = new FavoritesSession(storage(), () => new Promise(resolve => { release = resolve; }));
  session.setAccount('A'); await flush(); session.add(game); await flush(); session.setAccount('B'); await flush();
  release(await empty('570')); await flush(); assert.deepEqual(session.news, {}); assert.deepEqual(session.games, []);
});
test('Steam suggestions debounce typing and skip short queries', async t => {
  const { GameSuggestions } = require('../.test-build/favorites/suggestions');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const queries = [];
  const suggestions = new GameSuggestions(async query => { queries.push(query); return [game]; });
  suggestions.change('h'); t.mock.timers.tick(300); await flush(); assert.deepEqual(queries, []);
  suggestions.change('ha'); t.mock.timers.tick(200); suggestions.change('hades'); t.mock.timers.tick(299); await flush(); assert.deepEqual(queries, []);
  t.mock.timers.tick(1); await flush(); assert.deepEqual(queries, ['hades']); assert.deepEqual(suggestions.state.results, [game]); suggestions.dispose();
});
test('Steam suggestions ignore stale results and serialize latest queries', async t => {
  const { GameSuggestions } = require('../.test-build/favorites/suggestions');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = []; const resolvers = [];
  const suggestions = new GameSuggestions(query => { calls.push(query); return new Promise(resolve => resolvers.push(resolve)); });
  suggestions.change('hades'); t.mock.timers.tick(300); suggestions.change('valheim'); t.mock.timers.tick(300);
  assert.deepEqual(calls, ['hades']); resolvers[0]([game]); await flush();
  assert.deepEqual(calls, ['hades', 'valheim']); assert.deepEqual(suggestions.state.results, []);
  const latest = { appId: '42', name: 'Valheim' }; resolvers[1]([latest]); await flush(); assert.deepEqual(suggestions.state.results, [latest]); suggestions.dispose();
});
test('Clearing suggestions after an add prevents late results from restoring the menu', async t => {
  const { GameSuggestions } = require('../.test-build/favorites/suggestions');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve;
  const suggestions = new GameSuggestions(() => new Promise(done => { resolve = done; }));
  suggestions.change('hades'); t.mock.timers.tick(300); suggestions.clear(); resolve([game]); await flush();
  assert.deepEqual(suggestions.state, { query: '', results: [], phase: 'idle' }); suggestions.dispose();
});
test('Suggestion failures are visible, and dismissing/unmounting cancels queued work', async t => {
  const { GameSuggestions } = require('../.test-build/favorites/suggestions');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const suggestions = new GameSuggestions(async () => { calls++; throw Error('Steam unavailable'); });
  suggestions.change('hades'); t.mock.timers.tick(300); await flush(); assert.equal(suggestions.state.phase, 'error'); assert.match(suggestions.state.error, /unavailable/);
  suggestions.change('valheim'); suggestions.dispose(); t.mock.timers.tick(300); await flush(); assert.equal(calls, 1);
});
test('Toggling a lit favorite removes it persistently and toggling again adds it back', async () => {
  const disk = storage(); const session = new FavoritesSession(disk, empty);
  session.setAccount('A'); await flush(); session.toggle(game); await flush();
  assert.deepEqual(session.games, [game]); session.toggle(game); await flush(); assert.deepEqual(session.games, []);
  const restarted = new FavoritesSession(disk, empty); restarted.setAccount('A'); await flush(); assert.deepEqual(restarted.games, []);
  restarted.toggle(game); await flush(); assert.deepEqual(restarted.games, [game]);
  assert.deepEqual(JSON.parse(disk.values.get('A')).games, [game]);
});
