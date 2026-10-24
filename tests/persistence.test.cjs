const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DiskCache, decodeSavedCache, DISK_LIMIT } = require('../.test-build/news/persistence.js');
const { NewsroomSession, REFRESH_MS } = require('../.test-build/news/session.js');
const { HistoryCache, RETENTION_MS } = require('../.test-build/news/historyCache.js');
const account = '76561198000000001', other = '76561198000000002';
const now = 1800000000000;
const post = { id: '18446744073709551615', title: 'Patch', publishedAt: now / 1000, text: 'Changes', content: '[h1]Changes[/h1]' };
const result = { posts: [post], complete: true, latestTimestamp: now / 1000 };
const saved = (extra = {}) => ({ version: 1, accountId: account, savedAt: now, nextRefreshAt: now + REFRESH_MS,
  completed: 1, total: 1, paused: false, interrupted: false,
  news: { 570: { ...result, status: 'ready' } }, histories: [], ...extra });
const host = () => ({ App: { m_CurrentUser: { strSteamID: account } }, appStore: { m_bIsInitialized: true,
  allApps: [{ appid: 570, app_type: 1, display_name: 'Game', BIsOwned: () => true, BIsBorrowed: () => false }] } });
const settle = () => new Promise(resolve => setImmediate(resolve));
const ids = new Set(['570']);
function diskMemory(initial) {
  let contents = initial, writes = 0;
  return { transport: { read: async () => contents ?? { missing: true }, write: async payload => { writes++; contents = payload; return { ok: true }; },
    clear: async () => { contents = undefined; return { ok: true }; } }, get contents() { return contents; }, get writes() { return writes; } };
}

test('saved cache accepts text/object FFI, preserves string IDs, and sanitizes links', () => {
  for (const payload of [saved(), JSON.stringify(saved())]) {
    const restored = decodeSavedCache(payload, account, ids, now);
    assert.equal(restored.news['570'].posts[0].id, post.id);
    assert.equal(restored.news['570'].posts[0].content, post.content);
  }
  const input = saved(); input.news['570'].posts = [{ ...post, url: 'javascript:bad()', title: '<script>bad()</script>Patch' }];
  const restored = decodeSavedCache(input, account, ids, now);
  assert.equal(restored.news['570'].posts[0].url, undefined);
  assert.equal(restored.news['570'].posts[0].title, 'Patch');
});

test('missing/expired/other-account caches are ignored and removed games stay excluded', () => {
  assert.equal(decodeSavedCache({ missing: true }, account, ids, now), undefined);
  assert.equal(decodeSavedCache(saved(), other, ids, now), undefined);
  assert.equal(decodeSavedCache(saved({ savedAt: now - RETENTION_MS - 1 }), account, ids, now), undefined);
  assert.deepEqual(decodeSavedCache(saved(), account, new Set(), now).news, {});
});

test('corrupt/versioned/malformed/oversized cache data is rejected', () => {
  for (const value of ['bad json', {}, saved({ version: 2 }), saved({ completed: 3 }), saved({ news: { 570: { complete: true, status: 'ready', posts: [{ ...post, id: 42 }] } } }), 'x'.repeat(DISK_LIMIT + 1)]) {
    assert.throws(() => decodeSavedCache(value, account, ids, now));
  }
});

test('fresh restart restores news and history without fetching, then refreshes when due', async () => {
  const memory = diskMemory(JSON.stringify(saved({ histories: [{ key: `${account}:570:7`, expires: now + REFRESH_MS, result }] })));
  const disk = new DiskCache(memory.transport), histories = new HistoryCache();
  let clock = now, calls = 0;
  const session = new NewsroomSession(host, async () => { calls++; return { appnews: { appid: 570, newsitems: [] } }; }, () => {}, () => clock, disk, histories);
  session.tick(); assert.equal(session.restoring, true); await settle();
  assert.equal(calls, 0); assert.equal(session.restored, true);
  assert.equal(session.news['570'].posts[0].id, post.id);
  assert.equal(histories.get(`${account}:570:7`, clock).posts[0].id, post.id);
  assert.equal(session.nextRefreshAt, now + REFRESH_MS);
  clock += REFRESH_MS; session.tick(); await settle(); await disk.flush();
  assert.equal(calls, 1); assert.equal(session.news['570'].posts.length, 0);
  session.dispose(); await disk.flush();
});

test('stale restart renders previous news during offline refresh and persists failure coverage', async () => {
  const memory = diskMemory(saved({ nextRefreshAt: now - 1 })), disk = new DiskCache(memory.transport);
  let reject;
  const session = new NewsroomSession(host, () => new Promise((_, fail) => reject = fail), () => {}, () => now, disk, new HistoryCache());
  session.tick(); await settle();
  assert.equal(session.scanning, true); assert.equal(session.news['570'].posts[0].id, post.id);
  reject(Error('Offline')); await settle(); await disk.flush();
  assert.equal(session.news['570'].status, 'error'); assert.equal(session.news['570'].posts.length, 1);
  const restored = decodeSavedCache(memory.contents, account, ids, now);
  assert.equal(restored.news['570'].error, 'Offline');
  assert.equal(restored.interrupted, false);
  session.dispose(); await disk.flush();
});

test('interrupted or incomplete saved scans resume even before the next refresh', async () => {
  for (const input of [saved({ interrupted: true }), saved({ news: {}, completed: 0 })]) {
    const disk = new DiskCache(diskMemory(input).transport); let calls = 0;
    const session = new NewsroomSession(host, async () => { calls++; return { appnews: { appid: 570, newsitems: [] } }; }, () => {}, () => now, disk);
    session.tick(); await settle(); assert.equal(calls, 1);
    session.dispose(); await disk.flush();
  }
});

test('late restore after account switch cannot publish the old account cache', async () => {
  const h = host(); let resolve;
  const disk = new DiskCache({ read: () => new Promise(done => resolve = done), write: async () => ({ ok: true }), clear: async () => ({ ok: true }) });
  const session = new NewsroomSession(() => h, async () => { throw Error('Unexpected fetch'); }, () => {}, () => now, disk);
  session.tick(); const oldRead = resolve;
  h.App.m_CurrentUser.strSteamID = other; session.tick(); const newRead = resolve;
  oldRead(saved()); await settle(); assert.deepEqual(session.news, {});
  newRead(saved({ accountId: other })); await settle();
  assert.equal(session.library.snapshot.accountId, other);
  assert.equal(session.news['570'].posts[0].id, post.id);
  session.dispose(); await disk.flush();
});

test('corrupt storage falls back to Steam and reports a warning; write failures retain live news', async () => {
  const disk = new DiskCache({ read: async () => 'broken', write: async () => { throw Error('Read-only disk'); }, clear: async () => ({ ok: true }) });
  let calls = 0;
  const session = new NewsroomSession(host, async () => { calls++; return { appnews: { appid: 570, newsitems: [] } }; }, () => {}, () => now, disk);
  session.tick(); await settle(); await disk.flush();
  assert.equal(calls, 1); assert.equal(session.news['570'].status, 'ready');
  assert.match(session.storageWarning, /could not be saved/);
  session.dispose(); await disk.flush();
});

test('single writer coalesces checkpoints and finishes the newest snapshot last', async () => {
  const writes = []; let release;
  const disk = new DiskCache({ read: async () => ({}), clear: async () => ({ ok: true }),
    write: async payload => { writes.push(JSON.parse(payload)); if (writes.length === 1) await new Promise(done => release = done); return '{"ok":true}'; } });
  disk.queue(saved({ completed: 0 }), true);
  disk.queue(saved({ savedAt: now + 1 }));
  disk.queue(saved({ savedAt: now + 2 }));
  release(); await disk.flush();
  assert.equal(writes.length, 2); assert.equal(writes[1].savedAt, now + 2);
});

test('clear cancels pending checkpoints and in-flight scans cannot recreate deleted cache', async () => {
  const memory = diskMemory(saved()), disk = new DiskCache(memory.transport); let resolve;
  const session = new NewsroomSession(host, () => new Promise(done => resolve = done), () => {}, () => now, disk);
  session.tick(); await settle(); session.refreshNews();
  await session.clearSavedNews();
  resolve({ appnews: { appid: 570, newsitems: [] } }); await settle();
  session.dispose(); await disk.flush();
  assert.equal(memory.contents, undefined);
});

test('history restores stale text for offline reads while respecting age/account/window bounds', () => {
  const input = saved({ histories: [
    { key: `${account}:570:7`, expires: now - 1, result },
    { key: `${other}:570:7`, expires: now + 1000, result },
    { key: `${account}:999:7`, expires: now + 1000, result },
  ] });
  const restored = decodeSavedCache(input, account, ids, now);
  assert.equal(restored.histories.length, 1);
  const cache = new HistoryCache(); cache.restore(restored.histories);
  assert.equal(cache.get(`${account}:570:7`, now), undefined);
  assert.equal(cache.peek(`${account}:570:7`, now).posts[0].id, post.id);
  assert.equal(cache.peek(`${account}:570:7`, now + RETENTION_MS), undefined);
});

test('storage payload pruning respects the UTF-8 budget and marks omitted games incomplete', async () => {
  const memory = diskMemory(), disk = new DiskCache(memory.transport);
  const large = { ...result, posts: Array.from({ length: 100 }, (_, i) => ({ ...post, id: String(i), content: '漢'.repeat(100000) })) };
  disk.queue(saved({ news: { 570: { ...large, status: 'ready' } } }), true); await disk.flush();
  assert.ok(Buffer.byteLength(memory.contents, 'utf8') <= DISK_LIMIT);
  assert.equal(JSON.parse(memory.contents).interrupted, true);
});

test('Lua disk storage performs real bounded I/O, atomic replacement, and safe failure recovery', context => {
  if (spawnSync('luajit', ['-v']).error?.code === 'ENOENT') return context.skip('LuaJIT is required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'newsroom-cache-test-'));
  fs.mkdirSync(path.join(directory, 'steam-newsroom'));
  try {
    const child = spawnSync('luajit', ['tests/storage.test.lua', directory], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /storage contracts passed/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a new session restores a previous session’s committed JSON file and opened histories', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'newsroom-restart-test-'));
  const filename = path.join(directory, 'cache-v1.json');
  const transport = {
    read: async () => fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : { missing: true },
    write: async payload => { fs.writeFileSync(filename + '.tmp', payload); fs.renameSync(filename + '.tmp', filename); return { ok: true }; },
    clear: async () => { fs.rmSync(filename, { force: true }); return { ok: true }; },
  };
  try {
    const disk1 = new DiskCache(transport), histories1 = new HistoryCache();
    const session1 = new NewsroomSession(host, async () => ({ appnews: { appid: 570, newsitems: [{
      gid: post.id, title: post.title, contents: post.content, date: post.publishedAt,
      appid: 570, feedname: 'steam_community_announcements',
    }] } }), () => {}, () => now, disk1, histories1);
    session1.tick(); await settle();
    histories1.set(`${account}:570:30`, result, now);
    session1.dispose(); await disk1.flush();
    const disk2 = new DiskCache(transport), histories2 = new HistoryCache(); let calls = 0;
    const session2 = new NewsroomSession(host, async () => { calls++; throw Error('Unexpected refresh'); }, () => {}, () => now + 1000, disk2, histories2);
    session2.tick(); await settle();
    assert.equal(calls, 0);
    assert.equal(session2.news['570'].posts[0].id, post.id);
    assert.equal(histories2.get(`${account}:570:30`, now + 1000).posts[0].id, post.id);
    assert.equal(session2.nextRefreshAt, now + REFRESH_MS);
    session2.dispose(); await disk2.flush();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('deleting saved news waits for the active writer and drops pending writes', async () => {
  const events = []; let release;
  const disk = new DiskCache({ read: async () => ({}),
    write: async () => { events.push('write started'); await new Promise(resolve => release = resolve); events.push('write committed'); return { ok: true }; },
    clear: async () => { events.push('deleted'); return { ok: true }; },
  });
  disk.queue(saved(), true); disk.queue(saved({ savedAt: now + 1 }));
  const clearing = disk.clear(); release(); await clearing;
  assert.deepEqual(events, ['write started', 'write committed', 'deleted']);
  await disk.flush(); assert.equal(events.length, 3);
});
