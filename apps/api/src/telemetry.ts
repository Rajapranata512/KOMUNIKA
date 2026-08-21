import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';

function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.split(/[?#]/, 1)[0];
}

export function sanitizeSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    data: undefined,
    message: undefined,
  };
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...event,
    breadcrumbs: event.breadcrumbs?.map(sanitizeSentryBreadcrumb),
    extra: undefined,
    request: event.request
      ? {
          ...event.request,
          cookies: undefined,
          data: undefined,
          env: undefined,
          headers: undefined,
          query_string: undefined,
          url: sanitizeUrl(event.request.url),
        }
      : undefined,
    user: undefined,
  };
}
