/** Shared by weekly scans and detail reads; leaving a page cancels queued work. */
export class RequestQueue {
  private active = 0;
  private pending: (() => void)[] = [];
  constructor(private readonly limit: number = 2) {}

  run<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push(() => {
        this.active++;
        Promise.resolve().then(() => {
          signal.throwIfAborted();
          return job();
        }).then(resolve, reject).finally(() => { this.active--; this.drain(); });
      });
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.limit && this.pending.length) this.pending.shift()!();
  }
}
