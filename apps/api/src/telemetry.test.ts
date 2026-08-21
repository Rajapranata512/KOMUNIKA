import { describe, expect, it } from 'vitest';

import { sanitizeSentryBreadcrumb, sanitizeSentryEvent } from './telemetry.js';

describe('Sentry telemetry sanitization', () => {
  it('removes private request and identity data before delivery', () => {
    const event = sanitizeSentryEvent({
      extra: { manuscript: 'private text' },
      request: {
        cookies: { session: 'secret' },
        data: { password: 'secret' },
        env: { SESSION_SECRET: 'secret' },
        headers: { authorization: 'Bearer secret' },
        query_string: 'token=secret',
        url: 'https://api.example.test/api/v1/auth/reset?token=secret',
      },
      type: undefined,
      user: { email: 'author@example.test', id: 'user-1', ip_address: '127.0.0.1' },
    });

    expect(event.extra).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({
      cookies: undefined,
      data: undefined,
      env: undefined,
      headers: undefined,
      query_string: undefined,
      url: 'https://api.example.test/api/v1/auth/reset',
    });
  });

  it('keeps breadcrumb classification while removing payloads and messages', () => {
    expect(
      sanitizeSentryBreadcrumb({
        category: 'http',
        data: { url: 'https://example.test/?token=secret' },
        level: 'error',
        message: 'Request failed for author@example.test',
      }),
    ).toEqual({
      category: 'http',
      data: undefined,
      level: 'error',
      message: undefined,
    });
  });
});
