import { DialogButton, Navigation } from 'millennium';
import { useEffect, useRef, useState } from 'react';
import { onNewsroomHome, publishTopControl } from './navigation';
import { filterLibrary } from './library/steamLibrary';
import { sortGames, weeklyGroups, type SortOrder, type NewsPost } from './news/news';
import { FavoriteSearch } from './favorites/FavoriteSearch';
import { favoriteGames, favoriteGroups } from './favorites/favorites';
import { useFavorites, useIgnored, useNewsroomSession } from './news/useNewsroomSession';
import { refreshCountdown } from './news/session';
import { useFavoriteFeedback } from './components/FavoriteFeedback';
import { GameDetail } from './components/GameDetail';
import { GameTile } from './components/GameTile';
import { NewsPostView } from './components/NewsPostView';
import { Icon } from './components/Icon';
import { newsroomStyles } from './styles';

const PAGE_SIZE = 48;
type View = 'news' | 'library' | 'favorites' | 'ignored';

export const NewsroomPage = ({ onVisibilityChange }: { onVisibilityChange: (visible: boolean) => void }) => {
  const favoriteFeedback = useFavoriteFeedback();
  const weekly = useNewsroomSession();
  const favorites = useFavorites();
  const ignored = useIgnored();
  const state = weekly.library;
  const snapshot = state.snapshot;
  const ignoreReady = ignored.ready && ignored.accountId === snapshot?.accountId;
  const games = ignoreReady ? ignored.visible(snapshot?.games ?? []) : [];
  const [view, setView] = useState<View>('news');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sorts, setSorts] = useState<Record<View, SortOrder>>({ news: 'news', library: 'name', favorites: 'name', ignored: 'name' });
  const [selection, setSelection] = useState<{ accountId: string; appId: string; post?: NewsPost }>();
  const [favoriteError, setFavoriteError] = useState('');
  const toggleFavorite = (game: { appId: string; name: string }) => {
    try { favorites.toggle(game); setFavoriteError(''); }
    catch (error) { setFavoriteError(error instanceof Error ? error.message : 'Could not update favorite.'); }
  };
  const ignoreGame = (game: { appId: string; name: string }) => {
    try { ignored.add(game); setFavoriteError(''); }
    catch (error) { setFavoriteError(error instanceof Error ? error.message : 'Could not ignore game.'); }
  };
  const [showFailures, setShowFailures] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const savedGames = ignoreReady && favorites.accountId === snapshot?.accountId ? favoriteGames(ignored.visible(favorites.games), games) : [];
  const allGames = [...games, ...savedGames.filter(game => !games.some(owned => owned.appId === game.appId))];
  const favoriteIds = new Set(savedGames.map(game => game.appId));
  const favoriteNews = { ...weekly.news, ...favorites.news };
  const selectedGame = selection?.accountId === snapshot?.accountId
    ? allGames.find(game => game.appId === selection?.appId) : undefined;
  const searched = filterLibrary(view === 'favorites' ? savedGames : games, search);
  const groups = weeklyGroups(searched, weekly.news, Math.floor(Date.now() / 1000), sorts.news);
  const listed = sortGames(searched, sorts[view], view === 'favorites' ? favoriteNews : weekly.news);
  const favoriteRows = favoriteGroups(searched, favoriteNews, Math.floor(Date.now() / 1000), sorts.favorites);
  const count = view === 'news' ? groups.length : listed.length;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  const activeNews = view === 'favorites' ? favoriteNews : weekly.news;
  const failedGames = (view === 'favorites' ? savedGames : games).filter(game => activeNews[game.appId]?.status === 'error');
  const failed = failedGames.length;
  const activeGames = view === 'favorites' ? savedGames : games;
  const checked = activeGames.filter(game => activeNews[game.appId]).length;
  const scanning = view === 'favorites' ? favorites.scanning : weekly.scanning;
  const paused = view !== 'favorites' && weekly.paused;
  const incomplete = activeGames.map(game => activeNews[game.appId]).filter(entry => entry?.status === 'ready' && !entry.complete).length;
  const openGame = (appId: string, post?: NewsPost) => {
    if (snapshot) {
      setSelection({ accountId: snapshot.accountId, appId, post });
      if (panel.current) panel.current.scrollTop = 0;
    }
  };
  const closeMenu = () => { if (menu.current) menu.current.open = false; };
  const changeView = (next: View) => {
    setSearch('');
    setSelection(undefined); setView(next); setPage(0);
    if (panel.current) panel.current.scrollTop = 0;
  };

  useEffect(() => { setSearch(''); setPage(0); setSelection(undefined); setFavoriteError(''); }, [snapshot?.accountId]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  useEffect(() => onNewsroomHome(() => {
    setSelection(undefined); setView('news');
    if (panel.current) panel.current.scrollTop = 0;
  }), []);
  useEffect(() => {
    publishTopControl(panel.current && panel.current.scrollTop > 500
      ? { run: () => panel.current?.scrollTo({ top: 0, behavior: 'smooth' }) } : undefined);
    return () => publishTopControl(undefined);
  }, [selectedGame?.appId, view]);
  useEffect(() => {
    onVisibilityChange(true);
    return () => onVisibilityChange(false);
  }, [onVisibilityChange]);

  return (
    <main ref={panel} onClickCapture={favoriteFeedback.onClickCapture} data-newsroom-scroll className="steam-newsroom-page" aria-label="Steam Newsroom"
      onScroll={() => publishTopControl(panel.current && panel.current.scrollTop > 500
        ? { run: () => panel.current?.scrollTo({ top: 0, behavior: 'smooth' }) } : undefined)}>
      <style>{newsroomStyles}</style>
      {favoriteFeedback.feedback}
      <header className="nr-header">
        <div>
          <h1 className="nr-title">Steam Newsroom</h1>
          <p className="nr-subtitle">News and updates for your games, all in one place.</p>
        </div>
        <div className="nr-header-actions">
          <span className="nr-timer" role="timer" title={weekly.restored ? 'Saved news restored. Refresh continues automatically.' : 'News refreshes every 15 minutes while Steam runs.'}>
            <Icon name="clock" />
            {view === 'favorites' && favorites.loading ? 'Restoring Favorites…' : weekly.restoring ? 'Restoring saved news…' : (view === 'favorites' ? favorites.scanning : weekly.scanning) ? 'Refreshing news…' : `Next refresh ${refreshCountdown(view === 'favorites' ? favorites.nextRefreshAt : weekly.nextRefreshAt, Date.now())}`}
          </span>
          <DialogButton className="nr-btn nr-primary" onClick={() => { weekly.refreshLibrary(); weekly.refreshNews(); void favorites.refresh(); }} disabled={weekly.scanning || weekly.restoring}>
            <Icon name="refresh" /> Refresh
          </DialogButton>
          <details ref={menu} className="nr-more" onKeyDown={event => {
            if (event.key === 'Escape') { closeMenu(); menu.current?.querySelector('summary')?.focus({ preventScroll: true }); }
          }}>
            <summary aria-label="More Newsroom actions" title="More actions">⋯</summary>
            <div className="nr-more-menu" role="group" aria-label="More Newsroom actions">
              <DialogButton className="nr-link" onClick={() => { closeMenu(); Navigation.Navigate('/library/home'); }}>Back to Steam Library</DialogButton>
              <DialogButton className="nr-link" onClick={() => { closeMenu(); weekly.refreshLibrary(); }}>Refresh library</DialogButton>
              <DialogButton className="nr-link" onClick={() => { closeMenu(); void weekly.clearSavedNews(); }} disabled={weekly.restoring || weekly.clearing}>Clear saved news</DialogButton>
            </div>
          </details>
        </div>
      </header>

      <nav className="nr-tabs" aria-label="Newsroom views">
        <DialogButton className="nr-tab" aria-pressed={view === 'news'} onClick={() => changeView('news')}>News & Updates</DialogButton>
        <DialogButton className="nr-tab" aria-pressed={view === 'library'} onClick={() => changeView('library')}>Library · {games.length}</DialogButton>
        <DialogButton className="nr-tab" aria-pressed={view === 'favorites'} onClick={() => changeView('favorites')}>Favorites · {savedGames.length}</DialogButton>
        <DialogButton className="nr-tab" aria-pressed={view === 'ignored'} onClick={() => changeView('ignored')}>Ignored · {ignored.games.length}</DialogButton>
      </nav>
      {ignored.loading && <div className="nr-notice" role="status">Restoring ignored games before checking news…</div>}
      {ignored.warning && <div className="nr-notice nr-warning" role="alert">{ignored.warning} <button type="button" onClick={ignored.ready ? ignored.retrySave : ignored.restore}>Retry</button></div>}
      {favorites.warning && <div className="nr-notice nr-warning" role="alert">{favorites.warning} <button type="button" onClick={favorites.ready ? favorites.retrySave : favorites.restore}>Retry</button></div>}
      {favoriteError && <div className="nr-notice nr-warning" role="alert">{favoriteError}</div>}
      {weekly.storageWarning && <div className="nr-notice nr-warning" role="alert">{weekly.storageWarning}</div>}
      {state.status === 'loading' && <div className="nr-notice" role="status">Waiting for Steam to load your library…</div>}
      {state.status === 'error' && <div className="nr-notice nr-warning" role="alert">{state.message} {snapshot ? 'Showing the last successful library read.' : ''}</div>}
      {snapshot && (view === 'ignored' ? (
        <section className="nr-ignored-list" aria-label="Ignored games">
          <h2>Ignored games</h2>
          <p className="nr-detail-hint">Hidden from browsing and searches. Unignore a game to check its news again.</p>
          {ignored.ready && !ignored.games.length && <div className="nr-empty">No ignored games.</div>}
          <ul>{[...ignored.games].sort((a, b) => a.name.localeCompare(b.name)).map(game => <li key={game.appId}>
            <span>{game.name}</span><button type="button" onClick={() => ignored.remove(game.appId)} disabled={!ignored.ready}>Unignore</button>
          </li>)}</ul>
        </section>
      ) : selectedGame ? (
        <GameDetail key={`${snapshot.accountId}:${selectedGame.appId}`} accountId={snapshot.accountId} game={selectedGame} owned={games.some(game => game.appId === selectedGame.appId)} selectedPost={selection?.post} refreshAt={weekly.nextRefreshAt} onBack={() => setSelection(undefined)} />
      ) : (
        <>
          {view === 'favorites' && <FavoriteSearch key={snapshot.accountId} accountId={snapshot.accountId} />}
          <div className="nr-toolbar">
            <p className="nr-context">{view === 'news' ? 'Updates from the last 7 days' : view === 'favorites' ? 'Your favorites · updates from the last 7 days' : 'All your games. Installed or not.'}</p>
            <div className="nr-search">
              <Icon name="search" size={18} />
              <input type="text" aria-label="Search games" placeholder="Search games…" autoComplete="off" value={search}
                onChange={event => { setSearch(event.currentTarget.value); setPage(0); }} />
              <button type="button" className="nr-search-clear" aria-label="Clear game search" title="Clear search" disabled={!search}
                onClick={() => { setSearch(''); setPage(0); }}>×</button>
            </div>
            <label className="nr-sort">Sort
              <select aria-label="Sort games" value={sorts[view]} onChange={event => {
                const value = event.currentTarget.value;
                if (value === 'name' || value === 'playtime' || value === 'news') {
                  setSorts(previous => ({ ...previous, [view]: value })); setPage(0);
                }
              }}>
                <option value="name">Name A–Z</option>
                <option value="playtime">Playtime · highest</option>
                <option value="news">Newest news</option>
              </select>
            </label>
            <div className={`nr-status ${failed || incomplete || paused ? 'nr-attention' : ''}`} role="status"
              title="Only games checked successfully can be confirmed to have no recent posts. Missing or failed checks do not mean there is no news.">
              <Icon name={failed || incomplete || paused ? 'alert' : scanning ? 'refresh' : 'check'} />
              <span>{view === 'favorites' ? `${scanning ? 'Checking · ' : ''}${checked} / ${savedGames.length} checked` : weekly.scanning ? `${weekly.completed} / ${weekly.total} checked` : weekly.paused ? `Paused · ${weekly.completed} checked` : `${weekly.completed} checked`}
                {failed > 0 ? ` · ${failed} need attention` : ''}{incomplete > 0 ? ` · ${incomplete} partial` : ''}</span>
              {failed > 0 && <DialogButton className="nr-link" aria-expanded={showFailures} onClick={() => setShowFailures(value => !value)}>
                {showFailures ? 'Hide details' : 'View details'}
              </DialogButton>}
            </div>
          </div>
          {showFailures && failed > 0 && <section className="nr-failures" aria-label="Failed news checks">
            <h2>Games that could not be checked</h2>
            <p className="nr-detail-hint">These games may still have news. Previous posts remain available.</p>
            {failedGames.map(game => <div className="nr-failure" key={game.appId}>
              <DialogButton className="nr-link" onClick={() => openGame(game.appId)}>{game.name}</DialogButton>
              <p>{activeNews[game.appId]?.error}</p>
            </div>)}
            <p className="nr-detail-hint" style={{ marginTop: 12 }}>Use Refresh to retry.</p>
          </section>}
          <div className={`nr-grid ${view !== 'library' ? 'nr-news-grid' : 'nr-library-grid'}`} aria-label={view === 'news' ? 'Games with recent news' : view === 'favorites' ? 'Favorite games' : 'Library games'}>
            {view === 'library' ? listed.slice(start, start + PAGE_SIZE).map(game => (
              <GameTile key={game.appId} game={game} onOpen={() => openGame(game.appId)} favorite={favoriteIds.has(game.appId)} favoriteDisabled={!favorites.ready || !ignoreReady} onIgnore={() => ignoreGame(game)} ignoreDisabled={!ignoreReady || !favorites.ready}
                onFavorite={() => toggleFavorite(game)} />
            )) : (view === 'favorites' ? favoriteRows : groups).slice(start, start + PAGE_SIZE).map(({ game, posts, entry }) => (
              <GameTile key={game.appId} game={game} onOpen={() => openGame(game.appId)} favorite={favoriteIds.has(game.appId)} removeFavorite={view === 'favorites'} favoriteDisabled={!favorites.ready || !ignoreReady} onIgnore={view === 'favorites' ? undefined : () => ignoreGame(game)} ignoreDisabled={!ignoreReady || !favorites.ready}
                onFavorite={() => view === 'favorites' ? favorites.remove(game.appId) : toggleFavorite(game)}>
                {posts.slice(0, 3).map(post => <NewsPostView key={post.id} post={post} onOpen={() => openGame(game.appId, post)} />)}
                {entry?.status === 'error' && <p className="nr-detail-hint">{entry.error} {posts.length ? 'Showing saved posts.' : ''}</p>}
                {view === 'favorites' && !posts.length && entry?.status !== 'error' && <p className="nr-detail-hint">{entry ? entry.complete ? 'No updates in the last week.' : 'No recent posts loaded. Coverage is incomplete.' : 'Checking for updates…'}</p>}
                {entry && !entry.complete && <p className="nr-detail-hint">Partial weekly coverage</p>}
                <div className="nr-history-link">
                  <DialogButton className="nr-link" onClick={() => openGame(game.appId)}>View game history <span aria-hidden="true">→</span></DialogButton>
                </div>
              </GameTile>
            ))}
          </div>
          {!count && <div className="nr-empty" role="status">
            {search ? 'No matching games in this view.' : view === 'favorites' ? favorites.loading ? 'Restoring Favorites…' : 'No favorite games yet. Add a game above or use a game’s star.' : view === 'library' ? 'No owned base games found.'
              : weekly.scanning ? 'Recent posts will appear as games are checked.'
                : failed || weekly.paused || incomplete ? 'No recent posts loaded. News coverage is incomplete.'
                  : 'No developer announcements in the last week.'}
          </div>}
          {count > 0 && <div className="nr-pagination">
            <DialogButton className="nr-btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</DialogButton>
            <span>Page {currentPage + 1} of {pageCount} · {count} games</span>
            <DialogButton className="nr-btn" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</DialogButton>
          </div>}
        </>
      ))}
    </main>
  );
};
