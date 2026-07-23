/**
 * Limits heavy stylized rebuilds per frame (grass / flowers).
 */

export class StylizedBuildQueue {
  constructor({
    buildsPerFrame = 1,
    budgetMs = 3,
    now = () => performance.now(),
  } = {}) {
    this.buildsPerFrame = buildsPerFrame;
    this.budgetMs = budgetMs;
    this.now = now;
    this.queue = [];
  }

  get size() {
    return this.queue.length;
  }

  clear() {
    this.queue.length = 0;
  }

  enqueue(job) {
    const key = job.key;
    this.queue = this.queue.filter((entry) => entry.key !== key);
    this.queue.push(job);
  }

  flush(run) {
    const startedAt = this.now();
    let built = 0;
    while (
      this.queue.length > 0
      && built < this.buildsPerFrame
      && this.now() - startedAt < this.budgetMs
    ) {
      const job = this.queue.shift();
      // Only count successful work so stale/no-op jobs cannot starve real rebuilds.
      if (run(job)) {
        built += 1;
      }
    }
    return { built, remaining: this.queue.length };
  }
}
