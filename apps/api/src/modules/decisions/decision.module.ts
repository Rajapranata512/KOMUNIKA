import { Module } from '@nestjs/common';

import { AuthService } from '../identity/auth.service.js';
import { MfaService } from '../identity/mfa.service.js';
import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';
import { DecisionController } from './decision.controller.js';
import { DecisionService } from './decision.service.js';

@Module({
  controllers: [DecisionController],
  providers: [DecisionService, AuthService, MfaService, TransactionalEmailQueue],
})
export class DecisionModule {}
