const installedMarker = Symbol.for('aksara.serverApiProtectionInstalled');

type InstrumentedGlobal = typeof globalThis & {
  [installedMarker]?: boolean;
};

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof Request) return new URL(input.url);
    return new URL(input.toString());
  } catch {
    return null;
  }
}

export function installServerApiProtectionBypass(): () => void {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const apiBaseUrl = process.env.API_BASE_URL;
  const instrumentedGlobal = globalThis as InstrumentedGlobal;
  if (!bypassSecret || !apiBaseUrl || instrumentedGlobal[installedMarker]) return () => undefined;

  const apiOrigin = new URL(apiBaseUrl).origin;
  const originalFetch = globalThis.fetch;
  instrumentedGlobal[installedMarker] = true;

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (requestUrl(input)?.origin !== apiOrigin) return originalFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    headers.set('x-vercel-protection-bypass', bypassSecret);

    if (input instanceof Request) {
      return originalFetch(new Request(input, { ...init, headers }));
    }
    return originalFetch(input, { ...init, headers });
  };

  return () => {
    globalThis.fetch = originalFetch;
    delete instrumentedGlobal[installedMarker];
  };
}
