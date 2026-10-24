import { artworkCandidates } from './artwork';
export interface LibraryGame {
  appId: string;
  name: string;
  installation: 'installed' | 'not-installed';
  playtimeMinutes: number | null;
  artworkUrl: string;
  artworkUrls?: string[];
}

export interface LibrarySnapshot {
  accountId: string;
  games: LibraryGame[];
  readAt: number;
}

export type LibraryState =
  | { status: 'loading'; snapshot?: LibrarySnapshot }
  | { status: 'ready'; snapshot: LibrarySnapshot }
  | { status: 'error'; message: string; snapshot?: LibrarySnapshot };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : undefined;
}

function currentAccountId(host: unknown): string | undefined {
  const currentUser = record(record(record(host)?.App)?.m_CurrentUser);
  const id = currentUser?.strSteamID;
  return typeof id === 'string' && /^[1-9]\d{16,19}$/.test(id) ? id : undefined;
}

// Steam's allApps is the library overview list, not the installed/recent list.
// These internal APIs are deliberately contained here and checked at runtime.
function ownedGames(apps: unknown[]): LibraryGame[] {
  const games = new Map<string, LibraryGame>();
  for (const value of apps) {
    const app = record(value);
    if (!app || !Number.isInteger(app.app_type)) {
      throw new Error('Steam returned an unsupported library entry.');
    }
    // EAppType.Game = 1. Exclude tools, demos, DLC, and non-Steam shortcuts.
    if (app.app_type !== 1) continue;
    if (typeof app.BIsOwned !== 'function' || typeof app.BIsBorrowed !== 'function') {
      throw new Error('This Steam version does not expose the expected ownership information.');
    }
    const owned: unknown = app.BIsOwned();
    const borrowed: unknown = app.BIsBorrowed();
    if (typeof owned !== 'boolean' || typeof borrowed !== 'boolean') {
      throw new Error('Steam returned unsupported ownership information.');
    }
    if (!owned || borrowed) continue;
    if (typeof app.appid !== 'number' || !Number.isInteger(app.appid)
      || app.appid <= 0 || app.appid > 0xffffffff) {
      throw new Error('Steam returned an invalid game identifier.');
    }
    const appId = String(app.appid);
    const local = record(app.local_per_client_data);
    const installation = local?.installed === true ? 'installed' : 'not-installed';
    games.set(appId, {
      appId,
      name: typeof app.display_name === 'string' && app.display_name.trim()
        ? app.display_name.trim() : 'Untitled game',
      installation,
      playtimeMinutes: typeof app.minutes_playtime_forever === 'number'
        && Number.isFinite(app.minutes_playtime_forever) && app.minutes_playtime_forever >= 0
        ? app.minutes_playtime_forever : null,
      artworkUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
      artworkUrls: artworkCandidates(appId, app.header_filename),
    });
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return [...games.values()].sort((a, b) => collator.compare(a.name, b.name)
    || Number(a.appId) - Number(b.appId));
}

/** A read failure retains only a successful snapshot belonging to this account. */
export function readLibraryState(
  host: unknown,
  previous?: LibrarySnapshot,
  now: number = Date.now(),
): LibraryState {
  let accountId: string | undefined;
  try {
    accountId = currentAccountId(host);
    if (!accountId) return { status: 'loading' };
    const store = record(record(host)?.appStore);
    if (!store || store.m_bIsInitialized === false) {
      return { status: 'loading', snapshot: previous?.accountId === accountId ? previous : undefined };
    }
    if (store.m_bIsInitialized !== true || !Array.isArray(store.allApps)) {
      throw new Error('This Steam version does not expose the expected full-library list.');
    }
    const games = ownedGames(store.allApps);
    // Never publish an old account's data if the active identity changed mid-read.
    if (currentAccountId(host) !== accountId) return { status: 'loading' };
    return { status: 'ready', snapshot: { accountId, games, readAt: now } };
  } catch (error) {
    let sameAccount = false;
    try {
      sameAccount = Boolean(accountId) && currentAccountId(host) === accountId;
    } catch {
      // An unreadable identity must never reveal a previous account's snapshot.
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Steam library access failed.',
      snapshot: sameAccount && previous?.accountId === accountId ? previous : undefined,
    };
  }
}

export function filterLibrary(games: LibraryGame[], query: string): LibraryGame[] {
  const search = query.trim().toLocaleLowerCase();
  return games.filter(game => game.name.toLocaleLowerCase().includes(search)
    || game.appId.includes(search));
}
