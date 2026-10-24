import type { Favorite } from './favorites';

export interface SuggestionState {
  query: string;
  results: Favorite[];
  phase: 'idle' | 'waiting' | 'loading' | 'ready' | 'error';
  error?: string;
}
/** Debounced latest-query search; native HTTP cannot abort, so allow only one in flight. */
export class GameSuggestions {
  state: SuggestionState = { query: '', results: [], phase: 'idle' };
  private revision = 0;
  private active = false;
  private queued = false;
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  constructor(private search: (query: string) => Promise<Favorite[]>, private delayMs = 300) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  change(query: string) {
    if (this.disposed) return;
    ++this.revision;
    clearTimeout(this.timer); this.queued = false;
    const eligible = query.trim().length >= 2;
    this.state = { query, results: [], phase: eligible ? 'waiting' : 'idle' }; this.emit();
    if (eligible) this.timer = setTimeout(() => { this.queued = true; void this.run(); }, this.delayMs);
  }
  clear() { this.change(''); }
  private async run() {
    if (this.active || !this.queued || this.disposed) return;
    this.active = true; this.queued = false;
    const revision = this.revision, query = this.state.query.trim();
    this.state = { ...this.state, phase: 'loading' }; this.emit();
    try {
      const results = await this.search(query);
      if (!this.disposed && revision === this.revision) this.state = { query: this.state.query, results, phase: 'ready' };
    } catch (error) {
      if (!this.disposed && revision === this.revision) this.state = { query: this.state.query, results: [], phase: 'error',
        error: error instanceof Error ? error.message : 'Steam search is unavailable. Try another search.' };
    } finally {
      this.active = false;
      if (!this.disposed) { this.emit(); void this.run(); }
    }
  }
  dispose() { this.disposed = true; ++this.revision; clearTimeout(this.timer); this.queued = false; this.listeners.clear(); }
}
