import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';

import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { IdentityModule } from './identity/identity.module.js';
import { JournalModule } from './journals/journal.module.js';
import { SubmissionModule } from './submissions/submission.module.js';
import { EditorialModule } from './editorial/editorial.module.js';
import { ReviewModule } from './reviews/review.module.js';
import { DecisionModule } from './decisions/decision.module.js';
import { ProductionModule } from './production/production.module.js';

@Module({
  imports: [
    SentryModule.forRoot(),
    IdentityModule,
    JournalModule,
    SubmissionModule,
    EditorialModule,
    ReviewModule,
    DecisionModule,
    ProductionModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    HealthService,
  ],
})
export class AppModule {}
