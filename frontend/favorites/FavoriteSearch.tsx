import { useEffect, useRef, useState } from 'react';
import { confirmedGame, searchResults, type Favorite } from './favorites';
import { GameSuggestions } from './suggestions';
import { favorites, useIgnored } from '../news/useNewsroomSession';

function deadline<T>(call: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Steam search timed out. Try again.')), 15000);
    void call.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
export function FavoriteSearch({ accountId }: { accountId: string }) {
  const ignored = useIgnored();
  const [suggestions] = useState(() => new GameSuggestions(async query => searchResults(await deadline(backend.search_games(query)))));
  const [, render] = useState(0);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const alive = useRef(true);
  const section = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = suggestions.subscribe(() => render(value => value + 1));
    const dismiss = (event: PointerEvent) => {
      if (!section.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => { alive.current = false; unsubscribe(); suggestions.dispose(); document.removeEventListener('pointerdown', dismiss); };
  }, [suggestions]);
  const current = () => alive.current && favorites.accountId === accountId;
  const { query, phase, error } = suggestions.state;
  const results = ignored.visible(suggestions.state.results);
  const expanded = open && query.trim().length >= 2;
  const alreadyAdded = (game: Favorite) => favorites.games.some(item => item.appId === game.appId);
  const add = (game: Favorite) => {
    if (adding || alreadyAdded(game) || !favorites.ready) return;
    setAdding(true); setMessage(`Checking ${game.name}…`);
    void deadline(backend.fetch_artwork(Number(game.appId))).then(value => {
      if (!current()) return;
      const confirmed = confirmedGame(value, game.appId);
      favorites.add(confirmed);
      suggestions.clear(); setOpen(false); setActive(-1);
      setMessage(`Added ${confirmed.name} to Favorites.`);
      input.current?.focus({ preventScroll: true });
    }).catch(error => { if (current()) setMessage(error instanceof Error ? error.message : 'Could not add this game.'); })
      .finally(() => { if (current()) setAdding(false); });
  };
  return <section ref={section} className="nr-favorite-search" aria-label="Add a favorite game"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label htmlFor="nr-steam-game-search">Add games from Steam</label>
    <div className="nr-favorite-autocomplete">
      <div className="nr-favorite-search-row">
        <input ref={input} id="nr-steam-game-search" type="text" role="combobox" aria-autocomplete="list"
          aria-expanded={expanded} aria-controls="nr-steam-suggestions" aria-activedescendant={expanded && active >= 0 && results[active] ? `nr-steam-suggestion-${active}` : undefined}
          value={query} maxLength={100} placeholder="Search any Steam game…" autoComplete="off" readOnly={adding}
          onFocus={() => setOpen(true)}
          onChange={event => { suggestions.change(event.currentTarget.value); setOpen(true); setActive(-1); setMessage(''); }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
              event.preventDefault(); setOpen(true);
              setActive(previous => (previous + (event.key === 'ArrowDown' ? 1 : previous < 0 ? 0 : -1) + results.length) % results.length);
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (expanded && results.length) add(results[active >= 0 ? active : 0]);
            }
          }} />
      </div>
      {expanded && <div className="nr-favorite-dropdown">
        {(phase === 'waiting' || phase === 'loading') && <p role="status">Searching Steam…</p>}
        {phase === 'error' && <p role="status">{error}</p>}
        {phase === 'ready' && !results.length && <p role="status">No games found. Try another name.</p>}
        <ul id="nr-steam-suggestions" role="listbox" aria-label="Steam game suggestions" className="nr-favorite-results">
          {results.map((game, index) => <li key={game.appId} role="presentation">
            <button id={`nr-steam-suggestion-${index}`} type="button" role="option" aria-selected={active === index}
              disabled={adding || !favorites.ready || alreadyAdded(game)} onClick={() => add(game)}>
              <span>{game.name}</span><span className="nr-detail-hint">{alreadyAdded(game) ? 'Added ★' : 'Add favorite'}</span>
            </button>
          </li>)}
        </ul>
      </div>}
    </div>
    <p className="nr-detail-hint" role="status">{message || 'Type at least 2 characters, then choose a game to add.'}</p>
  </section>;
}
