const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readLibraryState, filterLibrary } = require('../.test-build/library/steamLibrary.js');

const ACCOUNT = '76561198000000001';
const OTHER_ACCOUNT = '76561198000000002';
function game(appid, name, overrides = {}) {
  return {
    appid, display_name: name, app_type: 1,
    subscribed_to: true, owner_account_id: 0,
    BIsOwned() { return this.subscribed_to; },
    BIsBorrowed() { return Boolean(this.owner_account_id); },
    local_per_client_data: { installed: false },
    ...overrides,
  };
}
function host(apps = [], overrides = {}) {
  return {
    App: { m_CurrentUser: { strSteamID: ACCOUNT } },
    appStore: { m_bIsInitialized: true, allApps: apps },
    ...overrides,
  };
}

test('includes uninstalled, never-played and hidden owned games, irrespective of install status', () => {
  const result = readLibraryState(host([
    game(12, 'Installed', { local_per_client_data: { installed: true } }),
    game(13, 'Uninstalled', { minutes_playtime_forever: 0 }),
    game(14, 'Hidden', { hidden: true }),
    game(15, 'No local client record', { local_per_client_data: undefined }),
  ]), undefined, 100);
  assert.equal(result.status, 'ready');
  assert.equal(result.snapshot.games.length, 4);
  assert.equal(result.snapshot.games.find(g => g.appId === '13').installation, 'not-installed');
  assert.equal(result.snapshot.games.find(g => g.appId === '15').installation, 'not-installed');
  assert.equal(result.snapshot.accountId, ACCOUNT);
  assert.equal(result.snapshot.readAt, 100);
});

test('excludes borrowed titles, unowned installed games, and non-game app types', () => {
  const result = readLibraryState(host([
    game(1, 'Owned'),
    game(2, 'Borrowed', { owner_account_id: 123 }),
    game(3, 'Unowned but installed', { subscribed_to: false, local_per_client_data: { installed: true } }),
    ...[2, 4, 8, 32, 1073741824].map((type, i) => game(100 + i, 'Not a base game', { app_type: type })),
  ]));
  assert.deepEqual(result.snapshot.games.map(g => g.appId), ['1']);
});

test('deduplicates by string AppID and sorts names with numeric ordering', () => {
  const result = readLibraryState(host([game(10, 'Game 10'), game(2, 'Game 2'), game(2, 'Game 2')]));
  assert.deepEqual(result.snapshot.games.map(g => g.appId), ['2', '10']);
});

test('a valid empty library differs from an unavailable or initializing library', () => {
  assert.equal(readLibraryState(host()).snapshot.games.length, 0);
  assert.equal(readLibraryState({}).status, 'loading');
  assert.equal(readLibraryState(host([], { appStore: { m_bIsInitialized: false } })).status, 'loading');
  assert.equal(readLibraryState(host([], { appStore: { m_bIsInitialized: true } })).status, 'error');
});

test('preserves the current account snapshot on failed or initializing reads', () => {
  const previous = readLibraryState(host([game(1, 'Last successful read')])).snapshot;
  const failed = readLibraryState(host([], { appStore: { m_bIsInitialized: true, allApps: null } }), previous);
  assert.equal(failed.status, 'error');
  assert.equal(failed.snapshot, previous);
  const loading = readLibraryState(host([], { appStore: { m_bIsInitialized: false } }), previous);
  assert.equal(loading.snapshot, previous);
});

test('clears previous-account data on account switch, sign-out, and unavailable new library', () => {
  const previous = readLibraryState(host([game(1, 'Account A game')])).snapshot;
  const otherUser = { App: { m_CurrentUser: { strSteamID: OTHER_ACCOUNT } } };
  assert.equal(readLibraryState(host([], { ...otherUser, appStore: {} }), previous).snapshot, undefined);
  assert.equal(readLibraryState(host([], { ...otherUser, appStore: undefined }), previous).snapshot, undefined);
  assert.equal(readLibraryState({}, previous).snapshot, undefined);
  const switched = readLibraryState(host([game(2, 'Account B game')], otherUser), previous);
  assert.equal(switched.snapshot.accountId, OTHER_ACCOUNT);
  assert.deepEqual(switched.snapshot.games.map(g => g.appId), ['2']);
});

test('rejects a snapshot if identity changes during enumeration', () => {
  const environment = host([game(1, 'Switching game', {
    BIsOwned() {
      environment.App.m_CurrentUser.strSteamID = OTHER_ACCOUNT;
      return true;
    },
  })]);
  const result = readLibraryState(environment);
  assert.equal(result.status, 'loading');
  assert.equal(result.snapshot, undefined);
});

test('unsupported ownership API and malformed data are errors, not empty success', () => {
  for (const app of [
    game(1, 'Missing ownership', { BIsOwned: undefined }),
    game(1, 'Bad ownership', { BIsOwned: () => undefined }),
    game(0, 'Invalid ID'),
    game(1, 'Invalid type', { app_type: undefined }),
    null,
  ]) {
    assert.equal(readLibraryState(host([app])).status, 'error');
  }
});

test('a throwing Steam getter retains only the current account snapshot', () => {
  const previous = readLibraryState(host([game(1, 'Cached')])).snapshot;
  const appStore = { m_bIsInitialized: true, get allApps() { throw new Error('Read failed'); } };
  const result = readLibraryState(host([], { appStore }), previous);
  assert.equal(result.status, 'error');
  assert.equal(result.snapshot, previous);
  assert.equal(result.message, 'Read failed');
});

test('a failed read after an identity change cannot retain the previous account snapshot', () => {
  const previous = readLibraryState(host([game(1, 'Account A')])).snapshot;
  const environment = host();
  environment.appStore = {
    m_bIsInitialized: true,
    get allApps() {
      environment.App.m_CurrentUser.strSteamID = OTHER_ACCOUNT;
      throw new Error('Account changed');
    },
  };
  assert.equal(readLibraryState(environment, previous).snapshot, undefined);
});

test('missing installed flag retains the game and uses Not Installed semantics', () => {
  const result = readLibraryState(host([game(1, 'Unknown status', { local_per_client_data: {} })]));
  assert.equal(result.snapshot.games[0].installation, 'not-installed');
});

test('search is case-insensitive, handles AppIDs, and cannot introduce non-library games', () => {
  const games = readLibraryState(host([game(11, 'Alpha'), game(22, 'Beta')])).snapshot.games;
  assert.deepEqual(filterLibrary(games, ' ALPHA ').map(g => g.appId), ['11']);
  assert.deepEqual(filterLibrary(games, '22').map(g => g.name), ['Beta']);
  assert.deepEqual(filterLibrary(games, 'Unowned title'), []);
  assert.equal(filterLibrary(games, '').length, 2);
});

test('reads a large library without installation-based truncation', () => {
  const games = Array.from({ length: 1500 }, (_, i) => game(i + 1, `Game ${i + 1}`));
  const result = readLibraryState(host(games));
  assert.equal(result.snapshot.games.length, 1500);
  assert.equal(result.snapshot.games[1499].name, 'Game 1500');
});

test('exposes lifetime playtime and fixed-origin artwork without a numeric title fallback', () => {
  const result = readLibraryState(host([
    game(570, 'Example', { minutes_playtime_forever: 9000 }),
    game(123, '', { minutes_playtime_forever: -1 }),
  ]));
  const example = result.snapshot.games.find(g => g.appId === '570');
  assert.equal(example.playtimeMinutes, 9000);
  assert.equal(example.artworkUrl, 'https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg');
  const untitled = result.snapshot.games.find(g => g.appId === '123');
  assert.equal(untitled.name, 'Untitled game');
  assert.equal(untitled.playtimeMinutes, null);
});
