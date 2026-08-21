import { Module } from '@nestjs/common';
import { AuthService } from '../identity/auth.service.js';
import { MfaService } from '../identity/mfa.service.js';
import { FileScanQueue } from '../submissions/file-scan.queue.js';
import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';
import { GalleyFileService } from './galley-file.service.js';
import { ProductionController } from './production.controller.js';
import { ProductionService } from './production.service.js';

@Module({
  controllers: [ProductionController],
  providers: [
    ProductionService,
    GalleyFileService,
    FileScanQueue,
    TransactionalEmailQueue,
    AuthService,
    MfaService,
  ],
})
export class ProductionModule {}
