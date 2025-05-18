// src/test.ts
import { JobQueue } from './JobQueue.js';

function assert(condition: any, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log("Running tests...");

  // 1. Basic job scheduling
  const queue1 = new JobQueue();
  const result1 = await queue1.schedule(async () => "test");
  assert(result1.result === "test", "Basic job should return result");
  console.log("PASS: Basic job scheduling");

  // 2. Error handling
  const queue2 = new JobQueue();
  try {
    await queue2.schedule(async () => { throw new Error("fail") });
    assert(false, "Expected job to throw");
  } catch (e: any) {
    assert(e.message === "fail", "Error message should propagate");
    console.log("PASS: Error handling");
  }

  // 3. Queue size and active count
  const queue3 = new JobQueue({ concurrencyLimit: 1 });
  queue3.schedule(() => delay(100));
  queue3.schedule(() => delay(100));
  assert(queue3.size() === 1, "Queue size should be 1");
  assert(queue3.active() === 1, "Active jobs should be 1");
  console.log("PASS: Queue size and active tracking");

  // 4. Concurrency limit
  const queue4 = new JobQueue({ concurrencyLimit: 2 });
  const p1 = queue4.schedule(() => delay(200));
  const p2 = queue4.schedule(() => delay(200));
  const p3 = queue4.schedule(() => delay(200));
  assert(queue4.active() === 2, "Two jobs should be active");
  assert(queue4.size() === 1, "One job should be queued");
  await Promise.all([p1, p2, p3]);
  console.log("PASS: Concurrency limit");

  // 5. Timeout behavior
  const queue5 = new JobQueue({ timeoutLimit: 1 });
  try {
    await queue5.schedule(() => delay(2000));
    assert(false, "Expected timeout error");
  } catch (e: any) {
    assert(e.message === "Timeout", "Should reject on timeout");
    console.log("PASS: Timeout behavior");
  }

  // 6. FIFO order
  const queue6 = new JobQueue({ concurrencyLimit: 1 });
  const results: number[] = [];
  await Promise.all([
    queue6.schedule(async () => { results.push(1); await delay(100); }),
    queue6.schedule(async () => { results.push(2); await delay(100); }),
    queue6.schedule(async () => { results.push(3); await delay(100); })
  ]);
  assert(JSON.stringify(results) === JSON.stringify([1,2,3]), "Should preserve FIFO order");
  console.log("PASS: FIFO order");

  // 7. Rate limiting
  const queue7 = new JobQueue({ rateLimit: 2 });
  const start = Date.now();
  await queue7.schedule(() => delay(10));
  await queue7.schedule(() => delay(10));
  await queue7.schedule(() => delay(10));
  const elapsed = Date.now() - start;
  assert(elapsed >= 30000, "Rate limiting should delay jobs");
  console.log("PASS: Rate limiting");

 const queue8 = new JobQueue({ concurrencyLimit: 0 }); // force job to queue
 const p8 = queue8.schedule(() => delay(1000));
 queue8.dispose();
 try {
 await p8;
 assert(false, "Expected dispose to reject queued jobs");
 } catch (e: any) {
 assert(e.message === "Queue has been disposed", "Dispose should reject jobs"); 
 console.log("PASS: Dispose behavior");
 }
})();
