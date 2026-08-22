const appBaseUrl = new URL(process.env.APP_BASE_URL).origin;
const apiBaseUrl = process.env.API_BASE_URL.replace(/\/$/, '');
const timeoutMs = Number(process.env.STAGING_SMOKE_TIMEOUT_MS ?? 15_000);

const checks = [
  { name: 'api-health', url: `${apiBaseUrl}/health`, expected: 200 },
  {
    name: 'api-readiness',
    url: `${apiBaseUrl}/health/readiness`,
    expected: 200,
    assert: (body) => body.includes('"database":"up"'),
  },
  { name: 'public-journals', url: `${apiBaseUrl}/journals`, expected: 200 },
  { name: 'public-articles', url: `${apiBaseUrl}/public/articles`, expected: 200 },
  { name: 'public-search-facets', url: `${apiBaseUrl}/public/search-facets`, expected: 200 },
  {
    name: 'private-file-denial',
    url: `${apiBaseUrl}/production/submissions/00000000-0000-4000-8000-000000000001/files/00000000-0000-4000-8000-000000000002`,
    expected: 401,
  },
  { name: 'web-home', url: `${appBaseUrl}/`, expected: 200 },
  { name: 'web-login', url: `${appBaseUrl}/login`, expected: 200 },
  { name: 'web-journals', url: `${appBaseUrl}/journals`, expected: 200 },
  { name: 'web-search', url: `${appBaseUrl}/search`, expected: 200 },
  { name: 'web-robots', url: `${appBaseUrl}/robots.txt`, expected: 200 },
  { name: 'web-sitemap', url: `${appBaseUrl}/sitemap.xml`, expected: 200 },
];

async function requestWithRetry(check) {
  let lastResult;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(check.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'aksara-staging-smoke/1.0' },
      });
      const body = await response.text();
      lastResult = { status: response.status, body };
      if (response.status === check.expected && (!check.assert || check.assert(body))) return;
      if (response.status < 500) break;
    } catch (error) {
      lastResult = { error: error instanceof Error ? error.name : 'unknown' };
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  const detail = 'status' in lastResult ? `status ${lastResult.status}` : lastResult.error;
  throw new Error(`${check.name} failed (${detail}).`);
}

const results = [];
for (const check of checks) {
  const started = performance.now();
  await requestWithRetry(check);
  results.push({
    name: check.name,
    status: 'passed',
    durationMs: Math.round(performance.now() - started),
  });
}

console.log(JSON.stringify({ status: 'passed', checks: results }));
