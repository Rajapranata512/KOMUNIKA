CREATE TYPE "ScreeningDecisionType" AS ENUM ('REQUEST_CORRECTION', 'DESK_REJECT', 'ASSIGN_EDITOR');

CREATE TABLE "EditorialAssignment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "assignmentNote" TEXT NOT NULL DEFAULT '',
    "overrideReason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ,
    CONSTRAINT "EditorialAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScreeningAssessment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "completenessPassed" BOOLEAN NOT NULL,
    "scopePassed" BOOLEAN NOT NULL,
    "policyPassed" BOOLEAN NOT NULL,
    "internalNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScreeningAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScreeningDecision" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "type" "ScreeningDecisionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "authorLetter" TEXT NOT NULL DEFAULT '',
    "requiredChanges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resultingState" "SubmissionState" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScreeningDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalEditorialNote" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalEditorialNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EditorialAssignment_journalId_active_assignedAt_idx" ON "EditorialAssignment"("journalId", "active", "assignedAt");
CREATE INDEX "EditorialAssignment_editorId_active_assignedAt_idx" ON "EditorialAssignment"("editorId", "active", "assignedAt");
CREATE INDEX "EditorialAssignment_submissionId_assignedAt_idx" ON "EditorialAssignment"("submissionId", "assignedAt");
CREATE UNIQUE INDEX "EditorialAssignment_one_active_per_submission" ON "EditorialAssignment"("submissionId") WHERE "active" = true;
CREATE INDEX "ScreeningAssessment_submissionId_createdAt_idx" ON "ScreeningAssessment"("submissionId", "createdAt");
CREATE INDEX "ScreeningAssessment_journalId_createdAt_idx" ON "ScreeningAssessment"("journalId", "createdAt");
CREATE INDEX "ScreeningDecision_submissionId_createdAt_idx" ON "ScreeningDecision"("submissionId", "createdAt");
CREATE INDEX "ScreeningDecision_journalId_type_createdAt_idx" ON "ScreeningDecision"("journalId", "type", "createdAt");
CREATE INDEX "InternalEditorialNote_submissionId_createdAt_idx" ON "InternalEditorialNote"("submissionId", "createdAt");
CREATE INDEX "InternalEditorialNote_journalId_createdAt_idx" ON "InternalEditorialNote"("journalId", "createdAt");

ALTER TABLE "EditorialAssignment" ADD CONSTRAINT "EditorialAssignment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialAssignment" ADD CONSTRAINT "EditorialAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialAssignment" ADD CONSTRAINT "EditorialAssignment_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialAssignment" ADD CONSTRAINT "EditorialAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScreeningAssessment" ADD CONSTRAINT "ScreeningAssessment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScreeningAssessment" ADD CONSTRAINT "ScreeningAssessment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScreeningAssessment" ADD CONSTRAINT "ScreeningAssessment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScreeningDecision" ADD CONSTRAINT "ScreeningDecision_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScreeningDecision" ADD CONSTRAINT "ScreeningDecision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScreeningDecision" ADD CONSTRAINT "ScreeningDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalEditorialNote" ADD CONSTRAINT "InternalEditorialNote_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalEditorialNote" ADD CONSTRAINT "InternalEditorialNote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalEditorialNote" ADD CONSTRAINT "InternalEditorialNote_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
