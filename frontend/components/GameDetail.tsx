import { DialogButton, Navigation } from 'millennium';
import { useState } from 'react';
import type { LibraryGame } from '../library/steamLibrary';
import { isHistoryWindow, sortedPosts, type NewsPost } from '../news/news';
import { useGameHistory, useHistoryPreference } from '../news/useGameHistory';
import { GameArtwork, playtimeLabel } from './GameTile';
import { NewsPostView } from './NewsPostView';
import { Icon } from './Icon';

export function GameDetail({ accountId, game, selectedPost, refreshAt, onBack, owned = true }: {
  accountId: string; game: LibraryGame; selectedPost?: NewsPost; refreshAt: number; onBack: () => void; owned?: boolean;
}) {
  const [target, setTarget] = useState(selectedPost);
  const preference = useHistoryPreference(accountId, game.appId);
  const history = useGameHistory(accountId, game.appId, preference.days, refreshAt);
  const fetched = history.result?.posts ?? [];
  // Keep the selected cached post readable during slow or failed history reads.
  const posts = target && !fetched.some(post => post.id === target.id)
    ? sortedPosts([...fetched, target]) : fetched;
  return (
    <section className="nr-detail" aria-label={`${game.name} news`}>
      <DialogButton className="nr-link" onClick={onBack}><Icon name="back" /> Back to Newsroom</DialogButton>
      <div className="nr-detail-header">
        <div className="nr-detail-art"><GameArtwork game={game} /></div>
        <div className="nr-detail-info">
          <h2><DialogButton className="nr-link" onClick={() => owned ? Navigation.Navigate(`/library/app/${game.appId}`) : Navigation.NavigateToExternalWeb(`https://store.steampowered.com/app/${game.appId}/`)} aria-label={`Open ${game.name} in ${owned ? 'Steam Library' : 'Steam Store'}`}>
            {game.name} <span aria-hidden="true">↗</span>
          </DialogButton></h2>
          <p className="nr-game-meta"><Icon name="clock" />{playtimeLabel(game.playtimeMinutes)} · {game.installation === 'installed' ? 'Installed' : 'Not Installed'}</p>
        </div>
      </div>
      <div className="nr-detail-controls">
        <label className="nr-sort">News history
          <select aria-label="News history" value={preference.days ?? 7} disabled={preference.days === undefined} onChange={event => {
            const days = Number(event.currentTarget.value);
            if (isHistoryWindow(days)) { setTarget(undefined); preference.changeDays(days); }
          }}>
            <option value={7}>Last week</option>
            <option value={30}>Last month</option>
            <option value={90}>Last 3 months</option>
            <option value={0}>All available history</option>
          </select>
        </label>
        <DialogButton className="nr-btn" onClick={history.refresh} disabled={history.loading}><Icon name="refresh" /> Refresh posts</DialogButton>
        <p className="nr-detail-hint">This window does not change your weekly feed.</p>
      </div>
      {preference.warning && <div className="nr-notice nr-warning" role="alert">{preference.warning}</div>}
      {(preference.days === undefined || history.loading) && <div className="nr-notice" role="status">Loading developer announcements…</div>}
      {history.error && <div className="nr-notice nr-warning" role="alert">{history.error} Use Refresh posts to retry.</div>}
      {posts.map(post => <NewsPostView key={post.id} post={post} initiallyExpanded={post.id === target?.id} />)}
      {history.result?.complete && !posts.length && <div className="nr-empty">No developer announcements in this time window.</div>}
      {history.result?.warning && <div className="nr-notice">{history.result.warning}</div>}
      {history.result?.nextBefore && <DialogButton className="nr-btn" disabled={history.loading} onClick={history.loadMore}>Load older posts</DialogButton>}
      <p className="nr-detail-hint" style={{ marginTop: 24 }}>History is limited to what Steam supplies. Unsupported media can be viewed in the original post.</p>
    </section>
  );
}
