import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';
import { JournalSubmissionController, SubmissionController } from './submission.controller.js';
import { FileScanQueue } from './file-scan.queue.js';
import { SubmissionFileService } from './submission-file.service.js';
import { SubmissionService } from './submission.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [JournalSubmissionController, SubmissionController],
  providers: [SubmissionService, SubmissionFileService, FileScanQueue],
})
export class SubmissionModule {}
