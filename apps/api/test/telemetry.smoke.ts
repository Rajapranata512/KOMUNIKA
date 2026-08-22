import '../src/instrument.js';

import * as Sentry from '@sentry/nestjs';

async function run(): Promise<void> {
  if (!process.env.SENTRY_DSN && !process.env.ERROR_TRACKING_DSN) {
    throw new Error('SENTRY_DSN or ERROR_TRACKING_DSN is required for the telemetry smoke test.');
  }

  Sentry.captureException(new Error('Aksara staging telemetry delivery verification'), {
    tags: {
      check: 'staging-telemetry',
    },
  });

  const delivered = await Sentry.flush(5_000);
  if (!delivered) {
    throw new Error('Sentry did not flush the staging telemetry event before the timeout.');
  }

  console.log(JSON.stringify({ status: 'passed', check: 'staging-telemetry-delivery' }));
}

void run();
