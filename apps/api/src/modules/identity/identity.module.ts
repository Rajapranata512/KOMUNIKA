import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimitService } from './rate-limit.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  controllers: [AuthController, AdminController, ProfileController],
  providers: [AuthService, LoginRateLimitService, ProfileService],
  exports: [AuthService],
})
export class IdentityModule {}
