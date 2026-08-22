import { afterEach, describe, expect, it, vi } from 'vitest';

import { installServerApiProtectionBypass } from './server-api-protection';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

describe('server API protection bypass', () => {
  it('adds the bypass only to the configured API origin', async () => {
    process.env.API_BASE_URL = 'https://api-staging.example.test/api/v1';
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'server-only-bypass';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const uninstall = installServerApiProtectionBypass();

    await fetch('https://api-staging.example.test/api/v1/health', {
      headers: { 'x-request-id': 'request-1' },
    });
    await fetch('https://unrelated.example.test/resource');

    const apiInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(apiInit?.headers).get('x-vercel-protection-bypass')).toBe(
      'server-only-bypass',
    );
    expect(new Headers(apiInit?.headers).get('x-request-id')).toBe('request-1');
    expect(fetchMock.mock.calls[1]?.[1]).toBeUndefined();
    uninstall();
  });

  it('does not instrument fetch when no bypass secret is configured', async () => {
    process.env.API_BASE_URL = 'https://api-staging.example.test/api/v1';
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const uninstall = installServerApiProtectionBypass();
    await fetch('https://api-staging.example.test/api/v1/health');

    expect(fetchMock.mock.calls[0]?.[1]).toBeUndefined();
    uninstall();
  });
});
