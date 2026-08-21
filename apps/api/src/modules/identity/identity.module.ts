import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimitService } from './rate-limit.service.js';
import { MfaService } from './mfa.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';

@Module({
  controllers: [AuthController, AdminController, ProfileController],
  providers: [
    AdminService,
    AuthService,
    LoginRateLimitService,
    MfaService,
    ProfileService,
    TransactionalEmailQueue,
  ],
  exports: [AuthService],
})
export class IdentityModule {}
