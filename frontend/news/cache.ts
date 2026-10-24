/** Bounded memory cache for public announcement pages; no account/library data. */
export class NewsPageCache {
  private pages = new Map<string, { body: string; expiresAt: number; bytes: number }>();
  private bytes = 0;
  constructor(private readonly lifetimeMs = 15 * 60 * 1000, private readonly maxBytes = 8 * 1024 * 1024) {}
  get(key: string, now = Date.now()): string | undefined {
    const page = this.pages.get(key);
    if (!page) return;
    if (page.expiresAt <= now) { this.remove(key); return; }
    return page.body;
  }
  set(key: string, body: string, now = Date.now()) {
    this.remove(key);
    const bytes = body.length * 2;
    if (bytes > this.maxBytes) return;
    while ((this.bytes + bytes > this.maxBytes || this.pages.size >= 128) && this.pages.size) {
      this.remove(this.pages.keys().next().value!);
    }
    this.pages.set(key, { body, bytes, expiresAt: now + this.lifetimeMs });
    this.bytes += bytes;
  }
  invalidate(appId?: string) {
    for (const key of this.pages.keys()) if (!appId || key.startsWith(`${appId}:`)) this.remove(key);
  }
  private remove(key: string) {
    const page = this.pages.get(key);
    if (page) { this.bytes -= page.bytes; this.pages.delete(key); }
  }
}
