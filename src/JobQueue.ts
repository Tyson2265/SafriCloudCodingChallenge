// src/JobQueue.ts

export interface JobQueueOptions {
  concurrencyLimit?: number;
  rateLimit?: number; // jobs per minute
  timeoutLimit?: number; // in seconds
}

export interface JobResult<T> {
  result: T;
  queueTime: number;
  executionTime: number;
}

interface QueuedJob<T> {
  fn: (...args: any[]) => Promise<T>;
  args: any[];
  resolve: (value: JobResult<T>) => void;
  reject: (reason?: any) => void;
  enqueuedAt: number;
}

export class JobQueue {
  private concurrencyLimit: number;
  private rateLimit: number;
  private timeoutLimit: number;
  private runningJobs = 0;
  private queue: QueuedJob<any>[] = [];
  private recentStarts: number[] = [];
  private disposed = false;

  constructor(options: JobQueueOptions = {}) {
    this.concurrencyLimit = options.concurrencyLimit ?? 1000;
    this.rateLimit = options.rateLimit ?? Infinity;
    this.timeoutLimit = options.timeoutLimit ?? 1200;
  }

  schedule<T>(fn: (...args: any[]) => Promise<T>, ...args: any[]): Promise<JobResult<T>> {
    if (this.disposed) return Promise.reject(new Error("Queue has been disposed"));

    return new Promise<JobResult<T>>((resolve, reject) => {
      this.queue.push({ fn, args, resolve, reject, enqueuedAt: Date.now() });
      this.process();
    });
  }

  size(): number {
    return this.queue.length;
  }

  active(): number {
    return this.runningJobs;
  }

  dispose(): void {
    this.disposed = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      job?.reject(new Error("Queue has been disposed"));
    }
  }

  private process() {
    if (this.runningJobs >= this.concurrencyLimit || this.queue.length === 0) return;

    const now = Date.now();
    this.recentStarts = this.recentStarts.filter(t => now - t < 60000);
    if (this.recentStarts.length >= this.rateLimit) {
      setTimeout(() => this.process(), 100);
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    const queueTime = Date.now() - job.enqueuedAt;
    this.runningJobs++;
    this.recentStarts.push(Date.now());

    const timeout = setTimeout(() => {
      job.reject(new Error("Timeout"));
      this.runningJobs--;
      this.process();
    }, this.timeoutLimit * 1000);

    const start = Date.now();

    job.fn(...job.args)
      .then(result => {
        clearTimeout(timeout);
        job.resolve({
          result,
          queueTime,
          executionTime: Date.now() - start
        });
      })
      .catch(err => {
        clearTimeout(timeout);
        job.reject(err);
      })
      .finally(() => {
        this.runningJobs--;
        this.process();
      });
  }
}
