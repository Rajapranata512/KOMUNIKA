import { Module } from '@nestjs/common';

import { AuthService } from '../identity/auth.service.js';
import { MfaService } from '../identity/mfa.service.js';
import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';
import { EditorialActionController, EditorialQueryController } from './editorial.controller.js';
import { EditorialService } from './editorial.service.js';

@Module({
  controllers: [EditorialQueryController, EditorialActionController],
  providers: [EditorialService, AuthService, MfaService, TransactionalEmailQueue],
})
export class EditorialModule {}
