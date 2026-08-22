CREATE TYPE "EditorialDecisionType" AS ENUM ('REJECT', 'MAJOR_REVISION', 'MINOR_REVISION', 'ACCEPT');
CREATE TYPE "RevisionEvaluationMode" AS ENUM ('EXTERNAL_REVIEW', 'EDITOR_ONLY');

ALTER TYPE "JournalTemplateKind" ADD VALUE 'DECISION_REJECT';
ALTER TYPE "JournalTemplateKind" ADD VALUE 'DECISION_MAJOR_REVISION';
ALTER TYPE "JournalTemplateKind" ADD VALUE 'DECISION_MINOR_REVISION';
ALTER TYPE "JournalTemplateKind" ADD VALUE 'DECISION_ACCEPT';

ALTER TABLE "Submission" ADD COLUMN "acceptedVersionId" UUID;
ALTER TABLE "SubmissionFile" ADD COLUMN "revisionId" UUID;

CREATE TABLE "EditorialDecision" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "reviewRoundId" UUID,
    "targetVersionId" UUID NOT NULL,
    "type" "EditorialDecisionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "resultingState" "SubmissionState" NOT NULL,
    "revisionDueAt" TIMESTAMPTZ,
    "responseRequired" BOOLEAN NOT NULL DEFAULT true,
    "evaluationMode" "RevisionEvaluationMode",
    "releasedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditorialDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialDecision_revision_fields_check" CHECK (
      (type IN ('MAJOR_REVISION', 'MINOR_REVISION') AND "revisionDueAt" IS NOT NULL AND "evaluationMode" IS NOT NULL)
      OR
      (type IN ('REJECT', 'ACCEPT') AND "revisionDueAt" IS NULL AND "evaluationMode" IS NULL)
    )
);

CREATE TABLE "DecisionLetter" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "decisionId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionLetter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionReviewRelease" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "decisionId" UUID NOT NULL,
    "reviewResponseId" UUID NOT NULL,
    "commentsToAuthorSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionReviewRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionReviewFileRelease" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "decisionId" UUID NOT NULL,
    "reviewFileId" UUID NOT NULL,
    "originalNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionReviewFileRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Revision" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "baseVersionId" UUID NOT NULL,
    "submittedVersionId" UUID,
    "responseRequired" BOOLEAN NOT NULL DEFAULT true,
    "responseText" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMPTZ NOT NULL,
    "finalizationKey" TEXT,
    "submittedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorialDecision_reviewRoundId_key" ON "EditorialDecision"("reviewRoundId");
CREATE INDEX "EditorialDecision_submissionId_createdAt_idx" ON "EditorialDecision"("submissionId", "createdAt");
CREATE INDEX "EditorialDecision_journalId_type_createdAt_idx" ON "EditorialDecision"("journalId", "type", "createdAt");
CREATE UNIQUE INDEX "DecisionLetter_decisionId_key" ON "DecisionLetter"("decisionId");
CREATE UNIQUE INDEX "DecisionReviewRelease_decisionId_reviewResponseId_key" ON "DecisionReviewRelease"("decisionId", "reviewResponseId");
CREATE UNIQUE INDEX "DecisionReviewFileRelease_decisionId_reviewFileId_key" ON "DecisionReviewFileRelease"("decisionId", "reviewFileId");
CREATE UNIQUE INDEX "Revision_decisionId_key" ON "Revision"("decisionId");
CREATE UNIQUE INDEX "Revision_submittedVersionId_key" ON "Revision"("submittedVersionId");
CREATE UNIQUE INDEX "Revision_finalizationKey_key" ON "Revision"("finalizationKey");
CREATE INDEX "Revision_submissionId_submittedAt_idx" ON "Revision"("submissionId", "submittedAt");
CREATE INDEX "Revision_journalId_dueAt_idx" ON "Revision"("journalId", "dueAt");
CREATE UNIQUE INDEX "Submission_acceptedVersionId_key" ON "Submission"("acceptedVersionId");
CREATE INDEX "SubmissionFile_revisionId_purpose_sortOrder_idx" ON "SubmissionFile"("revisionId", "purpose", "sortOrder");

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_acceptedVersionId_fkey" FOREIGN KEY ("acceptedVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDecision" ADD CONSTRAINT "EditorialDecision_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDecision" ADD CONSTRAINT "EditorialDecision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDecision" ADD CONSTRAINT "EditorialDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDecision" ADD CONSTRAINT "EditorialDecision_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "ReviewRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDecision" ADD CONSTRAINT "EditorialDecision_targetVersionId_fkey" FOREIGN KEY ("targetVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionLetter" ADD CONSTRAINT "DecisionLetter_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EditorialDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionReviewRelease" ADD CONSTRAINT "DecisionReviewRelease_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EditorialDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionReviewRelease" ADD CONSTRAINT "DecisionReviewRelease_reviewResponseId_fkey" FOREIGN KEY ("reviewResponseId") REFERENCES "ReviewResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionReviewFileRelease" ADD CONSTRAINT "DecisionReviewFileRelease_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EditorialDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionReviewFileRelease" ADD CONSTRAINT "DecisionReviewFileRelease_reviewFileId_fkey" FOREIGN KEY ("reviewFileId") REFERENCES "ReviewFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EditorialDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_submittedVersionId_fkey" FOREIGN KEY ("submittedVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
