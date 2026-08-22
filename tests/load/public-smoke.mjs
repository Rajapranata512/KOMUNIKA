import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.LOAD_BASE_URL ?? 'http://127.0.0.1:3001/api/v1').replace(/\/$/, '');
const requestCount = Number(process.env.LOAD_REQUESTS ?? 300);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 20);
const p95LimitMs = Number(process.env.LOAD_P95_LIMIT_MS ?? 2000);
const paths = ['/health', '/journals', '/public/articles?q=publikasi', '/public/search-facets'];

if (!Number.isInteger(requestCount) || requestCount < 1)
  throw new Error('LOAD_REQUESTS is invalid.');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200)
  throw new Error('LOAD_CONCURRENCY is invalid.');

const durations = [];
const failures = [];
let cursor = 0;
const startedAt = performance.now();

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= requestCount) return;
    const path = paths[index % paths.length];
    const started = performance.now();
    try {
      const response = await fetch(baseUrl + path, { signal: AbortSignal.timeout(10_000) });
      await response.arrayBuffer();
      durations.push(performance.now() - started);
      if (!response.ok) failures.push({ path, status: response.status });
    } catch (error) {
      durations.push(performance.now() - started);
      failures.push({ path, error: error instanceof Error ? error.name : 'unknown' });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
durations.sort((a, b) => a - b);
const percentile = (value) =>
  durations[Math.min(durations.length - 1, Math.ceil(value * durations.length) - 1)];
const elapsedMs = performance.now() - startedAt;
const report = {
  baseUrl,
  requests: requestCount,
  concurrency,
  failures: failures.length,
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  maxMs: Number(durations.at(-1).toFixed(1)),
  throughputPerSecond: Number(((requestCount * 1000) / elapsedMs).toFixed(1)),
};
console.log(JSON.stringify(report));
if (failures.length) {
  console.error(JSON.stringify({ sampleFailures: failures.slice(0, 10) }));
  process.exitCode = 1;
} else if (report.p95Ms > p95LimitMs) {
  console.error('Public read p95 exceeded ' + p95LimitMs + ' ms.');
  process.exitCode = 1;
}
