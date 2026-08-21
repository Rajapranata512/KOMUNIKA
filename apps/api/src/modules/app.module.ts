import { Module } from '@nestjs/common';

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
    IdentityModule,
    JournalModule,
    SubmissionModule,
    EditorialModule,
    ReviewModule,
    DecisionModule,
    ProductionModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
