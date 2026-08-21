import { Module } from '@nestjs/common';

import { AuthService } from '../identity/auth.service.js';
import { MfaService } from '../identity/mfa.service.js';
import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';
import { FileScanQueue } from '../submissions/file-scan.queue.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';

@Module({
  controllers: [ReviewController],
  providers: [ReviewService, AuthService, MfaService, TransactionalEmailQueue, FileScanQueue],
})
export class ReviewModule {}
