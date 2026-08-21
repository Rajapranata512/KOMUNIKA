import * as Sentry from '@sentry/nestjs';

import { sanitizeSentryBreadcrumb, sanitizeSentryEvent } from './telemetry.js';

const dsn = process.env.SENTRY_DSN || process.env.ERROR_TRACKING_DSN;

if (dsn) {
  Sentry.init({
    beforeBreadcrumb: sanitizeSentryBreadcrumb,
    beforeSend: sanitizeSentryEvent,
    dsn,
    environment: process.env.APP_ENV,
    maxBreadcrumbs: 20,
    normalizeDepth: 3,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
