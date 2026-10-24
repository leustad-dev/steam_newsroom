import { DialogBodyText, DialogButton } from 'millennium';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { LibraryGame } from '../library/steamLibrary';
import { resolveArtwork } from '../library/artworkTransport';
import { Icon } from './Icon';

export const buttonStyle: CSSProperties = { width: 'fit-content', padding: '8px 16px', boxSizing: 'border-box' };

export function playtimeLabel(minutes: number | null) {
  return minutes === null ? 'Playtime unavailable' : `${(minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} h played`;
}

export function GameArtwork({ game }: { game: LibraryGame }) {
  return <Artwork key={`${game.appId}:${game.artworkUrls?.join(',')}`} game={game} />;
}
function Artwork({ game }: { game: LibraryGame }) {
  const candidates = game.artworkUrls ?? [game.artworkUrl];
  const [index, setIndex] = useState(0);
  const [resolved, setResolved] = useState<string>();
  const [resolvedFailed, setResolvedFailed] = useState(false);
  const exhausted = index >= candidates.length;
  useEffect(() => {
    let cancelled = false;
    // Consult metadata for modern hash-based assets when filename information is absent.
    if (exhausted || !game.artworkUrls?.some(url => /\/\w{40}\//.test(url))) {
      void resolveArtwork(game.appId).then(url => { if (!cancelled) setResolved(url); });
    }
    return () => { cancelled = true; };
  }, [game.appId, exhausted]);
  const src = resolved && !resolvedFailed ? resolved : candidates[index];
  const failed = !src;
  return failed ? (
    <div style={{ aspectRatio: '460 / 215', display: 'grid', placeItems: 'center', background: '#25374a', padding: '16px', boxSizing: 'border-box' }}>
      <DialogBodyText>{game.name}</DialogBodyText>
    </div>
  ) : <img
    src={src} alt={game.name} loading="lazy" referrerPolicy="no-referrer"
    onError={() => { if (src === resolved) setResolvedFailed(true); if (src === candidates[index]) setIndex(value => value + 1); }}
    style={{ display: 'block', width: '100%', aspectRatio: '460 / 215', objectFit: 'cover' }}
  />;
}

export function GameTile({ game, onOpen, children, favorite = false, onFavorite, removeFavorite = false, favoriteDisabled = false, onIgnore, ignoreDisabled = false }: {
  game: LibraryGame; onOpen: () => void; children?: ReactNode; favorite?: boolean;
  onIgnore?: () => void; ignoreDisabled?: boolean; onFavorite?: () => void; removeFavorite?: boolean; favoriteDisabled?: boolean;
}) {
  return (
    <article className="nr-game-card" aria-label={game.name}>
      <DialogButton className="nr-card-open" onClick={onOpen} aria-label={`Read news for ${game.name}`}>
        <GameArtwork game={game} />
        <h3 className="nr-card-title">{game.name}</h3>
      </DialogButton>
      {onIgnore && <button type="button" className="nr-ignore-control" onClick={onIgnore}
        disabled={ignoreDisabled || favorite} aria-label={`Ignore ${game.name}`}
        title={favorite ? 'Remove from Favorites before ignoring' : 'Ignore this game'}>Ignore</button>}
      {onFavorite && <button type="button" className={`nr-favorite-control ${removeFavorite ? 'nr-favorite-remove' : ''}`}
        aria-label={`${removeFavorite || favorite ? 'Remove' : 'Add'} ${game.name} ${removeFavorite || favorite ? 'from' : 'to'} Favorites`}
        title={removeFavorite || favorite ? 'Remove from Favorites' : 'Add to Favorites'}
        aria-pressed={!removeFavorite ? favorite : undefined} disabled={favoriteDisabled} onClick={onFavorite}>
        {removeFavorite ? '−' : '★'}
      </button>}
      <div className="nr-card-body">
        <p className="nr-game-meta"><Icon name="clock" size={13} /> {playtimeLabel(game.playtimeMinutes)} <span aria-hidden="true">·</span> {game.installation === 'installed' ? 'Installed' : 'Not Installed'}</p>
        {children}
      </div>
    </article>
  );
}
