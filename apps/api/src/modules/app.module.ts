import { Module } from '@nestjs/common';

import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { JournalModule } from './journals/journal.module.js';

@Module({
  imports: [IdentityModule, JournalModule],
  controllers: [HealthController],
})
export class AppModule {}
