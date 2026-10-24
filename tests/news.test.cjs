const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { loadNewsWindow, parseNewsPage, withinWindow, weeklyGroups, sortGames, plainText,
  safeNewsUrl, isHistoryWindow, restoreHistoryWindow, WEEK_SECONDS, PAGE_SIZE } = require('../.test-build/news/news.js');
const { RequestQueue } = require('../.test-build/news/queue.js');
const { NewsPageCache } = require('../.test-build/news/cache.js');
const { createNewsReader } = require('../.test-build/news/createNewsReader.js');
const now = 1800000000;
const post = (id, date = now, overrides = {}) => ({
  gid: String(id), title: 'Update', contents: '[b]Patch notes[/b]', appid: 570,
  feedname: 'steam_community_announcements', date, url: 'https://store.steampowered.com/news/app/570/view/1', ...overrides,
});
const page = items => ({ appnews: { appid: 570, newsitems: items } });
const signal = () => new AbortController().signal;
const game = (id, name, minutes) => ({ appId: id, name, playtimeMinutes: minutes });

test('weekly cutoff includes boundary posts and excludes older/future posts', () => {
  const posts = parseNewsPage(page([post(1), post(2, now - WEEK_SECONDS), post(3, now - WEEK_SECONDS - 1), post(4, now + 1)]), '570');
  assert.deepEqual(withinWindow(posts, now - WEEK_SECONDS, now).map(p => p.id), ['1', '2']);
});

test('weekly feed omits empty games but never removes them from the Library', () => {
  const games = [game('570', 'Recent', 100), game('20', 'Quiet', 200), game('30', 'Unfetched', 50)];
  const news = { 570: { posts: parseNewsPage(page([post(1)]), '570'), complete: true, status: 'ready', latestTimestamp: now },
    20: { posts: [], complete: true, status: 'ready' } };
  assert.deepEqual(weeklyGroups(games, news, now, 'news').map(g => g.game.appId), ['570']);
  assert.equal(games.length, 3);
});

test('sort by playtime moves Valheim above Hades, retaining alphabetical ties/unknowns last', () => {
  const games = [game('1', 'Hades II', 6000), game('2', 'Valheim', 9000), game('3', 'Unknown', null)];
  assert.deepEqual(sortGames(games, 'playtime', {}).map(g => g.name), ['Valheim', 'Hades II', 'Unknown']);
  assert.deepEqual(sortGames(games, 'news', { 1: { latestTimestamp: now } }).map(g => g.appId), ['1', '3', '2']);
  assert.deepEqual(sortGames(games, 'name', {}).map(g => g.appId), ['1', '3', '2']);
});

test('detail window widening cannot mutate the fixed weekly feed', async () => {
  const reader = async () => page([post(1), post(2, now - 20 * 86400)]);
  const weekly = await loadNewsWindow(reader, '570', { since: now - WEEK_SECONDS, now, signal: signal() });
  const detail = await loadNewsWindow(reader, '570', { since: now - 30 * 86400, now, signal: signal() });
  assert.equal(detail.posts.length, 2);
  assert.equal(weekly.posts.length, 1);
});

test('empty response differs from failure and preserves 64-bit string source IDs', async () => {
  const empty = await loadNewsWindow(async () => page([]), '570', { since: 0, now, signal: signal() });
  assert.equal(empty.complete, true);
  assert.equal(empty.posts.length, 0);
  assert.throws(() => parseNewsPage({ error: 'Limited', status: 429 }, '570'), /Limited/);
  assert.throws(() => parseNewsPage({}, '570'), /unsupported/);
  assert.equal(parseNewsPage(page([post('18446744073709551615')]), '570')[0].id, '18446744073709551615');
  assert.throws(() => parseNewsPage(page([post(1, now, { gid: 123 })]), '570'), /unsupported/);
});

test('older-page overlap is deduplicated; posts remain newest first', async () => {
  const first = Array.from({ length: PAGE_SIZE }, (_, i) => post(i, now - i));
  const before = [];
  const result = await loadNewsWindow(async (_, cursor) => {
    before.push(cursor);
    return before.length === 1 ? page(first) : page([first[PAGE_SIZE - 1], post(101, now - PAGE_SIZE)]);
  }, '570', { since: 0, now, signal: signal() });
  assert.deepEqual(before, [0, now - PAGE_SIZE + 2]);
  assert.equal(result.posts.length, PAGE_SIZE + 1);
  assert.equal(result.posts[0].publishedAt, now);
  assert.equal(result.complete, true);
});

test('request budget exposes continuation; repeated equal-time boundary reports incomplete coverage', async () => {
  const batch = page(Array.from({ length: PAGE_SIZE }, (_, i) => post(i, now - 1)));
  const capped = await loadNewsWindow(async () => batch, '570', { since: 0, now, maxPages: 1, signal: signal() });
  assert.equal(capped.complete, false);
  assert.equal(capped.nextBefore, now);
  const repeated = await loadNewsWindow(async () => batch, '570', { since: 0, now, signal: signal() });
  assert.equal(repeated.complete, false);
  assert.equal(repeated.nextBefore, undefined);
  assert.match(repeated.warning, /did not advance/);
});

test('network failures and cancellation propagate instead of fabricating no news', async () => {
  await assert.rejects(loadNewsWindow(async () => { throw new Error('Offline'); }, '570', { since: 0, now, signal: signal() }), /Offline/);
  const controller = new AbortController(); controller.abort();
  let called = false;
  await assert.rejects(loadNewsWindow(async () => { called = true; return page([]); }, '570', { since: 0, now, signal: controller.signal }));
  assert.equal(called, false);
});

test('request queue bounds simultaneous jobs and drops cancelled queued work', async () => {
  const queue = new RequestQueue(2);
  let active = 0, maximum = 0, cancelledRan = false;
  const jobs = Array.from({ length: 8 }, () => queue.run(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
  }, signal()));
  const cancelled = new AbortController();
  const pending = queue.run(async () => { cancelledRan = true; }, cancelled.signal);
  cancelled.abort();
  await Promise.all([...jobs, assert.rejects(pending)]);
  assert.equal(maximum, 2);
  assert.equal(cancelledRan, false);
});

test('post markup is plain text and dangerous source links are rejected', () => {
  assert.equal(plainText('<script>alert(1)</script>[b]Update[/b]<p>Notes &amp; fixes</p>'), 'Update\nNotes & fixes');
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'http://store.steampowered.com/news', 'https://evil.example/post', 'https://steamcommunity.com.evil.example/']) {
    assert.equal(safeNewsUrl(url), undefined);
  }
  assert.ok(safeNewsUrl('https://steamcommunity.com/games/570/announcements/detail/1'));
});

test('only supported per-game history windows are accepted', () => {
  [0, 7, 30, 90].forEach(value => assert.equal(isHistoryWindow(value), true));
  [-1, 1, '7', null].forEach(value => assert.equal(isHistoryWindow(value), false));
});

test('saved history windows restore numeric/string values but empty settings keep the one-week default', () => {
  for (const value of [0, 7, 30, 90]) {
    assert.equal(restoreHistoryWindow(value), value);
    assert.equal(restoreHistoryWindow(String(value)), value);
  }
  for (const value of ['', ' ', undefined, null, 'invalid', {}, -1]) assert.equal(restoreHistoryWindow(value), 7);
});

test('public page cache expires, enforces a size budget, and supports forced refresh', () => {
  const cache = new NewsPageCache(100, 20);
  cache.set('1:0', '12345', 0);
  cache.set('2:0', '12345', 0);
  cache.set('3:0', '12345', 0);
  assert.equal(cache.get('1:0', 1), undefined);
  assert.equal(cache.get('2:0', 99), '12345');
  assert.equal(cache.get('2:0', 100), undefined);
  cache.invalidate('3');
  assert.equal(cache.get('3:0', 1), undefined);
  cache.set('4:0', 'x', 0);
  cache.invalidate();
  assert.equal(cache.get('4:0', 1), undefined);
  cache.set('5:0', 'x'.repeat(100), 0);
  assert.equal(cache.get('5:0', 1), undefined);
});

for (const format of ['decoded object', 'JSON text']) {
  test(`transport accepts ${format} from the FFI and replays its cache without ID precision loss`, async () => {
    let calls = 0;
    const payload = page([post('18446744073709551615')]);
    const transport = createNewsReader(async (appId, before) => {
      calls++;
      assert.equal(appId, 570);
      assert.equal(before, 0);
      return format === 'JSON text' ? JSON.stringify(payload) : payload;
    }, { spacingMs: 0 });
    for (let read = 0; read < 2; read++) {
      const result = await loadNewsWindow(transport.readPage, '570', { since: 0, now, signal: signal() });
      assert.equal(result.posts[0].id, '18446744073709551615');
      assert.equal(result.complete, true);
    }
    assert.equal(calls, 1);
    transport.invalidate('570');
    await transport.readPage('570', 0, signal());
    assert.equal(calls, 2);
  });
}

test('transport preserves source errors for objects and text and never caches them', async () => {
  for (const payload of [{ error: 'Slow down', status: 429 }, '{"error":"Slow down","status":429}']) {
    let calls = 0;
    const transport = createNewsReader(async () => { calls++; return payload; }, { spacingMs: 0 });
    for (let read = 0; read < 2; read++) {
      await assert.rejects(transport.readPage('570', 0, signal()), error => error.status === 429 && error.message === 'Slow down');
    }
    assert.equal(calls, 2);
  }
});

test('transport rejects malformed responses with a readable message rather than object coercion', async () => {
  for (const payload of ['not json', null, [], 42]) {
    const transport = createNewsReader(async () => payload, { spacingMs: 0 });
    await assert.rejects(transport.readPage('570', 0, signal()), /invalid JSON|unsupported news response/);
  }
});

test('transport bounds stalled RPCs and propagates backend failures', async () => {
  const timedOut = createNewsReader(() => new Promise(() => {}), { spacingMs: 0, timeoutMs: 5 });
  await assert.rejects(timedOut.readPage('570', 0, signal()), /timed out/);
  const offline = createNewsReader(async () => { throw new Error('Backend unavailable'); }, { spacingMs: 0 });
  await assert.rejects(offline.readPage('570', 0, signal()), /Backend unavailable/);
});

test('Lua backend validates parameters, uses a fixed TLS endpoint, and reports source errors', context => {
  const probe = spawnSync('luajit', ['-v']);
  if (probe.error?.code === 'ENOENT') return context.skip('LuaJIT is not installed; backend contract test requires it.');
  const result = spawnSync('luajit', ['tests/backend.test.lua'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /contracts passed/);
  const report = result.stdout.split('\n').find(line => line.startsWith('ERROR_PAYLOADS='));
  assert.ok(report, 'Backend test must report actual JSON error payloads');
  const payloads = JSON.parse(report.slice('ERROR_PAYLOADS='.length));
  assert.equal(payloads.length, 6);
  payloads.forEach(payload => assert.equal(typeof payload.error, 'string'));
  assert.equal(payloads[3].status, 503);
});

const { parseContent, contentText } = require('../.test-build/news/formatting.js');
const { NewsroomSession, REFRESH_MS, refreshCountdown } = require('../.test-build/news/session.js');
const { HistoryCache } = require('../.test-build/news/historyCache.js');
const accountA = '76561198000000001';
const accountB = '76561198000000002';
const sessionHost = (ids = [570]) => ({
  App: { m_CurrentUser: { strSteamID: accountA } },
  appStore: { m_bIsInitialized: true, allApps: ids.map(appid => ({
    appid, app_type: 1, display_name: `Game ${appid}`, BIsOwned: () => true, BIsBorrowed: () => false,
  })) },
});
const settle = () => new Promise(resolve => setImmediate(resolve));

test('Sandustry-style BBCode retains headings, paragraphs, nested bullets and strips clan images', () => {
  const content = '[img]{STEAM_CLAN_IMAGE}/44828248/image.png[/img][i]Greetings all Prospectors![/i]\n\nFirst content patch.\nPlease report issues.[h1]Changelog[/h1][b]v0.6.0[/b][list][*]New production chain[*]16 research nodes[list][*]Nested detail[/list][/list]';
  const tree = parseContent(content);
  assert.ok(tree.children.some(node => node.tag === 'h2'));
  const list = tree.children.find(node => node.tag === 'ul');
  assert.equal(list.children.filter(node => node.tag === 'li').length, 2);
  assert.equal(list.children[1].children.find(node => node.tag === 'ul').children[0].tag, 'li');
  assert.match(contentText(tree), /patch\.\nPlease report/);
  assert.match(contentText(tree), /• New production chain/);
  assert.doesNotMatch(contentText(tree), /STEAM_CLAN_IMAGE|image\.png/);
  assert.equal(plainText('{STEAM_CLAN_IMAGE}/44828248/image.png Hello'), 'Hello');
});

test('rich content ignores attributes, scripts, embeds, image URLs and unsafe links', () => {
  const tree = parseContent('<script>steal()</script><iframe>embed</iframe><h2 onclick="bad()">Notes</h2><ul><li>Fix &amp; &#65;</li></ul><img src="https://evil.example/a"><a href="javascript:bad()">Link text</a>[url=javascript:bad()]Other text[/url]');
  const json = JSON.stringify(tree);
  assert.doesNotMatch(json, /steal|embed|onclick|javascript|evil\.example/);
  assert.match(contentText(tree), /Fix & A/);
  assert.match(contentText(tree), /Link textOther text/);
  assert.ok(parseContent('[b]'.repeat(1000) + 'Deep' + '[/b]'.repeat(1000)));
});

test('full announcement contents exceed the old preview cap; exceptional limits are explicit', () => {
  const contents = '[h1]Patch notes[/h1]' + 'All changes. '.repeat(1000);
  const parsed = parseNewsPage(page([post(1, now, { contents })]), '570')[0];
  assert.equal(parsed.content, contents);
  assert.ok(parsed.text.length > 6000);
  assert.equal(parsed.contentLimited, false);
  const limited = parseNewsPage(page([post(2, now, { contents: 'x'.repeat(200001) })]), '570')[0];
  assert.equal(limited.content.length, 200000);
  assert.equal(limited.contentLimited, true);
});

test('session retains completed news with no page subscribers and refreshes at 15 minutes', async () => {
  let clock = now * 1000, calls = 0, invalidations = 0;
  const host = sessionHost();
  const session = new NewsroomSession(() => host, async () => { calls++; return page([post(1)]); }, () => invalidations++, () => clock);
  const unsubscribe = session.subscribe(() => {});
  session.tick(); await settle();
  const first = session.news['570'];
  assert.equal(first.posts.length, 1);
  unsubscribe(); // Leaving the route must not dispose the background session.
  clock += REFRESH_MS - 1; session.tick(); await settle();
  assert.equal(calls, 1);
  assert.equal(session.news['570'], first);
  const back = session.subscribe(() => {});
  assert.equal(session.news['570'].posts.length, 1);
  clock++; session.tick(); await settle();
  assert.equal(calls, 2);
  assert.equal(invalidations, 1);
  assert.equal(session.nextRefreshAt, clock + REFRESH_MS);
  back(); session.dispose();
});

test('refresh retains previous posts on failure, supplies per-game reasons, and recovers', async () => {
  let fail = false;
  const session = new NewsroomSession(() => sessionHost(), async () => {
    if (fail) throw new Error('Steam news returned HTTP 500.');
    return page([post(1)]);
  }, () => {}, () => now * 1000);
  session.tick(); await settle();
  fail = true; session.refreshNews(); await settle();
  assert.equal(session.news['570'].status, 'error');
  assert.match(session.news['570'].error, /500/);
  assert.equal(session.news['570'].posts.length, 1);
  fail = false; session.refreshNews(); await settle();
  assert.equal(session.news['570'].status, 'ready');
  assert.equal(session.news['570'].error, undefined);
  session.dispose();
});

test('paused scanning includes reasons for games that were never attempted', async () => {
  const session = new NewsroomSession(() => sessionHost([1, 2, 3, 4, 5]), async () => {
    const error = new (require('../.test-build/news/news.js').NewsSourceError)('Rate limited', 429);
    throw error;
  }, () => {}, () => now * 1000);
  session.tick(); await settle();
  assert.equal(session.paused, true);
  assert.equal(session.scanning, false);
  assert.ok(session.completed < session.total);
  assert.equal(Object.values(session.news).filter(entry => entry.status === 'error').length, 5);
  assert.match(session.news['5'].error, /Not checked/);
  session.dispose();
});

test('account changes cancel in-flight reads and never publish the previous account data', async () => {
  const host = sessionHost();
  const pending = [];
  const session = new NewsroomSession(() => host, () => new Promise(resolve => pending.push(resolve)), () => {}, () => now * 1000);
  session.tick();
  host.App.m_CurrentUser.strSteamID = accountB;
  session.tick();
  assert.deepEqual(session.news, {});
  pending[0](page([post('old-account')])); await settle();
  assert.deepEqual(session.news, {});
  pending[1](page([post('new-account')])); await settle();
  assert.equal(session.news['570'].posts[0].id, 'new-account');
  host.App.m_CurrentUser.strSteamID = '';
  session.tick();
  assert.equal(session.library.snapshot, undefined);
  assert.deepEqual(session.news, {});
  session.dispose();
});

test('automatic and manual refresh cannot overlap a slow scan; disposal cancels late results', async () => {
  let clock = now * 1000, calls = 0, resolve;
  const session = new NewsroomSession(() => sessionHost(), () => { calls++; return new Promise(done => resolve = done); }, () => {}, () => clock);
  session.tick();
  clock += 2 * REFRESH_MS;
  session.tick(); session.refreshNews();
  assert.equal(calls, 1);
  session.dispose(); resolve(page([post(1)])); await settle();
  assert.deepEqual(session.news, {});
});

test('history cache is account/window isolated, bounded, expires, and supports forced refresh', () => {
  const cache = new HistoryCache();
  const result = { posts: [], complete: true };
  cache.set(`${accountA}:570:7`, result, 0);
  assert.equal(cache.get(`${accountA}:570:7`, REFRESH_MS - 1), result);
  assert.equal(cache.get(`${accountB}:570:7`, 0), undefined);
  assert.equal(cache.get(`${accountA}:570:30`, 0), undefined);
  assert.equal(cache.get(`${accountA}:570:7`, REFRESH_MS), undefined);
  for (let i = 0; i < 17; i++) cache.set(`game${i}`, result, 0);
  assert.equal(cache.get('game0', 1), undefined);
  assert.equal(cache.get('game16', 1), result);
  cache.delete('game16');
  assert.equal(cache.get('game16', 1), undefined);
});

test('refresh countdown is visible in minutes/seconds and clamps after sleep', () => {
  assert.equal(refreshCountdown(REFRESH_MS, 0), '15:00');
  assert.equal(refreshCountdown(REFRESH_MS, 1000), '14:59');
  assert.equal(refreshCountdown(REFRESH_MS, REFRESH_MS - 1), '0:01');
  assert.equal(refreshCountdown(REFRESH_MS, 2 * REFRESH_MS), '0:00');
});
