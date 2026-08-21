CREATE TYPE "ReviewerAvailability" AS ENUM ('AVAILABLE', 'LIMITED', 'UNAVAILABLE');
CREATE TYPE "ReviewInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "ReviewConflictStatus" AS ENUM ('NOT_DECLARED', 'NO_CONFLICT', 'CONFLICT_DECLARED');
CREATE TYPE "ReviewResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED');
CREATE TYPE "ReviewRecommendation" AS ENUM ('ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT');
CREATE TYPE "ReviewQuestionType" AS ENUM ('LONG_TEXT', 'BOOLEAN', 'RATING');

CREATE TABLE "ReviewerProfile" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "journalId" UUID NOT NULL, "userId" UUID NOT NULL,
  "languages" TEXT[] DEFAULT ARRAY[]::TEXT[], "availability" "ReviewerAvailability" NOT NULL DEFAULT 'AVAILABLE',
  "maxActiveAssignments" INTEGER NOT NULL DEFAULT 3, "biography" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ReviewerProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewerProfile_capacity_check" CHECK ("maxActiveAssignments" BETWEEN 1 AND 100)
);
CREATE TABLE "ReviewerExpertise" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "profileId" UUID NOT NULL, "value" TEXT NOT NULL,
  CONSTRAINT "ReviewerExpertise_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReviewForm" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "journalId" UUID NOT NULL, "sectionId" UUID,
  "name" TEXT NOT NULL, "version" INTEGER NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewForm_pkey" PRIMARY KEY ("id"), CONSTRAINT "ReviewForm_version_check" CHECK ("version" > 0)
);
CREATE TABLE "ReviewFormQuestion" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "reviewFormId" UUID NOT NULL, "prompt" TEXT NOT NULL,
  "type" "ReviewQuestionType" NOT NULL DEFAULT 'LONG_TEXT', "required" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "ReviewFormQuestion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReviewRound" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "journalId" UUID NOT NULL, "submissionId" UUID NOT NULL,
  "submissionVersionId" UUID NOT NULL, "reviewFormId" UUID NOT NULL, "assignedEditorId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL, "openedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMPTZ,
  CONSTRAINT "ReviewRound_pkey" PRIMARY KEY ("id"), CONSTRAINT "ReviewRound_sequence_check" CHECK ("sequence" > 0)
);
CREATE TABLE "ReviewInvitation" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "journalId" UUID NOT NULL, "roundId" UUID NOT NULL,
  "reviewerId" UUID NOT NULL, "invitedById" UUID NOT NULL, "tokenHash" TEXT NOT NULL,
  "status" "ReviewInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "conflictStatus" "ReviewConflictStatus" NOT NULL DEFAULT 'NOT_DECLARED', "conflictNote" TEXT NOT NULL DEFAULT '',
  "responseDeadline" TIMESTAMPTZ NOT NULL, "reviewDeadline" TIMESTAMPTZ NOT NULL,
  "respondedAt" TIMESTAMPTZ, "tokenUsedAt" TIMESTAMPTZ, "reminderCount" INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewInvitation_deadlines_check" CHECK ("reviewDeadline" >= "responseDeadline")
);
CREATE TABLE "ReviewAssignment" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "roundId" UUID NOT NULL, "invitationId" UUID NOT NULL,
  "reviewerId" UUID NOT NULL, "submissionVersionId" UUID NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueAt" TIMESTAMPTZ NOT NULL, "lockedAt" TIMESTAMPTZ,
  CONSTRAINT "ReviewAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReviewResponse" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "assignmentId" UUID NOT NULL,
  "status" "ReviewResponseStatus" NOT NULL DEFAULT 'DRAFT', "commentsToAuthor" TEXT NOT NULL DEFAULT '',
  "confidentialComments" TEXT NOT NULL DEFAULT '', "recommendation" "ReviewRecommendation",
  "submittedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ReviewResponse_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReviewAnswer" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "responseId" UUID NOT NULL, "questionId" UUID NOT NULL, "value" TEXT NOT NULL,
  CONSTRAINT "ReviewAnswer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReviewFile" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "responseId" UUID NOT NULL, "storedFileId" UUID NOT NULL,
  "authorVisible" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewerProfile_journalId_availability_idx" ON "ReviewerProfile"("journalId", "availability");
CREATE UNIQUE INDEX "ReviewerProfile_journalId_userId_key" ON "ReviewerProfile"("journalId", "userId");
CREATE INDEX "ReviewerExpertise_value_idx" ON "ReviewerExpertise"("value");
CREATE UNIQUE INDEX "ReviewerExpertise_profileId_value_key" ON "ReviewerExpertise"("profileId", "value");
CREATE INDEX "ReviewForm_journalId_sectionId_isActive_idx" ON "ReviewForm"("journalId", "sectionId", "isActive");
CREATE UNIQUE INDEX "ReviewForm_journalId_name_version_key" ON "ReviewForm"("journalId", "name", "version");
CREATE UNIQUE INDEX "ReviewFormQuestion_reviewFormId_sortOrder_key" ON "ReviewFormQuestion"("reviewFormId", "sortOrder");
CREATE INDEX "ReviewRound_journalId_openedAt_idx" ON "ReviewRound"("journalId", "openedAt");
CREATE UNIQUE INDEX "ReviewRound_submissionId_sequence_key" ON "ReviewRound"("submissionId", "sequence");
CREATE UNIQUE INDEX "ReviewInvitation_tokenHash_key" ON "ReviewInvitation"("tokenHash");
CREATE INDEX "ReviewInvitation_reviewerId_status_responseDeadline_idx" ON "ReviewInvitation"("reviewerId", "status", "responseDeadline");
CREATE INDEX "ReviewInvitation_journalId_status_createdAt_idx" ON "ReviewInvitation"("journalId", "status", "createdAt");
CREATE UNIQUE INDEX "ReviewInvitation_roundId_reviewerId_key" ON "ReviewInvitation"("roundId", "reviewerId");
CREATE UNIQUE INDEX "ReviewAssignment_invitationId_key" ON "ReviewAssignment"("invitationId");
CREATE INDEX "ReviewAssignment_reviewerId_active_dueAt_idx" ON "ReviewAssignment"("reviewerId", "active", "dueAt");
CREATE UNIQUE INDEX "ReviewAssignment_roundId_reviewerId_key" ON "ReviewAssignment"("roundId", "reviewerId");
CREATE UNIQUE INDEX "ReviewResponse_assignmentId_key" ON "ReviewResponse"("assignmentId");
CREATE UNIQUE INDEX "ReviewAnswer_responseId_questionId_key" ON "ReviewAnswer"("responseId", "questionId");
CREATE UNIQUE INDEX "ReviewFile_storedFileId_key" ON "ReviewFile"("storedFileId");
CREATE INDEX "ReviewFile_responseId_authorVisible_idx" ON "ReviewFile"("responseId", "authorVisible");

ALTER TABLE "ReviewerProfile" ADD CONSTRAINT "ReviewerProfile_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewerProfile" ADD CONSTRAINT "ReviewerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewerExpertise" ADD CONSTRAINT "ReviewerExpertise_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ReviewerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewForm" ADD CONSTRAINT "ReviewForm_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewForm" ADD CONSTRAINT "ReviewForm_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "JournalSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewFormQuestion" ADD CONSTRAINT "ReviewFormQuestion_reviewFormId_fkey" FOREIGN KEY ("reviewFormId") REFERENCES "ReviewForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_submissionVersionId_fkey" FOREIGN KEY ("submissionVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_reviewFormId_fkey" FOREIGN KEY ("reviewFormId") REFERENCES "ReviewForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_assignedEditorId_fkey" FOREIGN KEY ("assignedEditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInvitation" ADD CONSTRAINT "ReviewInvitation_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInvitation" ADD CONSTRAINT "ReviewInvitation_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ReviewRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInvitation" ADD CONSTRAINT "ReviewInvitation_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInvitation" ADD CONSTRAINT "ReviewInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ReviewRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "ReviewInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_submissionVersionId_fkey" FOREIGN KEY ("submissionVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ReviewAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewAnswer" ADD CONSTRAINT "ReviewAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ReviewResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewAnswer" ADD CONSTRAINT "ReviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ReviewFormQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewFile" ADD CONSTRAINT "ReviewFile_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ReviewResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewFile" ADD CONSTRAINT "ReviewFile_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
