import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';
import { AdminJournalController, PublicJournalController } from './journal.controller.js';
import { JournalService } from './journal.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [PublicJournalController, AdminJournalController],
  providers: [JournalService],
})
export class JournalModule {}
