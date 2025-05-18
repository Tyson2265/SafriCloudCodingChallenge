// src/JobQueue.ts
export class JobQueue {
    concurrencyLimit;
    rateLimit;
    timeoutLimit;
    runningJobs = 0;
    queue = [];
    recentStarts = [];
    disposed = false;
    constructor(options = {}) {
        this.concurrencyLimit = options.concurrencyLimit ?? 1000;
        this.rateLimit = options.rateLimit ?? Infinity;
        this.timeoutLimit = options.timeoutLimit ?? 1200;
    }
    schedule(fn, ...args) {
        if (this.disposed)
            return Promise.reject(new Error("Queue has been disposed"));
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, args, resolve, reject, enqueuedAt: Date.now() });
            this.process();
        });
    }
    size() {
        return this.queue.length;
    }
    active() {
        return this.runningJobs;
    }
    dispose() {
        this.disposed = true;
        while (this.queue.length) {
            const job = this.queue.shift();
            job?.reject(new Error("Queue has been disposed"));
        }
    }
    process() {
        if (this.runningJobs >= this.concurrencyLimit || this.queue.length === 0)
            return;
        const now = Date.now();
        this.recentStarts = this.recentStarts.filter(t => now - t < 60000);
        if (this.recentStarts.length >= this.rateLimit) {
            setTimeout(() => this.process(), 100);
            return;
        }
        const job = this.queue.shift();
        if (!job)
            return;
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
