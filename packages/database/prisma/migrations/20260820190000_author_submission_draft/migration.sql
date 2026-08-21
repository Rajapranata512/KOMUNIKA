-- CreateEnum
CREATE TYPE "SubmissionState" AS ENUM ('DRAFT', 'SUBMITTED', 'INITIAL_SCREENING', 'PRE_REVIEW_CORRECTION_REQUESTED', 'EDITOR_ASSIGNED', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'RESUBMITTED', 'ACCEPTED', 'COPYEDITING', 'PRODUCTION', 'SCHEDULED', 'PUBLISHED', 'DESK_REJECTED', 'REJECTED', 'WITHDRAWN', 'DECLINED_BY_JOURNAL', 'RETRACTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submitterId" UUID NOT NULL,
    "articleTypeId" UUID NOT NULL,
    "state" "SubmissionState" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT,
    "abstract" TEXT NOT NULL DEFAULT '',
    "coverLetter" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'id',
    "finalizationKey" TEXT,
    "submittedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionAuthor" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "userId" UUID,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "affiliation" TEXT NOT NULL,
    "countryCode" TEXT,
    "orcidId" TEXT,
    "isCorresponding" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "SubmissionAuthor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionKeyword" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "SubmissionKeyword_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionSubject" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "SubmissionSubject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionDeclarationAcceptance" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "declarationId" UUID NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMPTZ,
    "declarationTitle" TEXT NOT NULL,
    "declarationBody" TEXT NOT NULL,
    "declarationCode" TEXT NOT NULL,
    "declarationVersion" INTEGER NOT NULL,
    CONSTRAINT "SubmissionDeclarationAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionChecklistAcceptance" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "checklistItemId" UUID NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMPTZ,
    "labelSnapshot" TEXT NOT NULL,
    CONSTRAINT "SubmissionChecklistAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionVersion" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionTimelineEvent" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "actorId" UUID,
    "state" "SubmissionState" NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "visibleToAuthor" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- Integrity and query indexes
CREATE UNIQUE INDEX "Submission_finalizationKey_key" ON "Submission"("finalizationKey");
CREATE INDEX "Submission_submitterId_state_updatedAt_idx" ON "Submission"("submitterId", "state", "updatedAt");
CREATE INDEX "Submission_journalId_state_submittedAt_idx" ON "Submission"("journalId", "state", "submittedAt");
CREATE INDEX "SubmissionAuthor_submissionId_isCorresponding_idx" ON "SubmissionAuthor"("submissionId", "isCorresponding");
CREATE UNIQUE INDEX "SubmissionAuthor_submissionId_sortOrder_key" ON "SubmissionAuthor"("submissionId", "sortOrder");
CREATE UNIQUE INDEX "SubmissionAuthor_one_corresponding_key" ON "SubmissionAuthor"("submissionId") WHERE "isCorresponding" = true;
CREATE UNIQUE INDEX "SubmissionKeyword_submissionId_value_key" ON "SubmissionKeyword"("submissionId", "value");
CREATE UNIQUE INDEX "SubmissionKeyword_submissionId_sortOrder_key" ON "SubmissionKeyword"("submissionId", "sortOrder");
CREATE UNIQUE INDEX "SubmissionSubject_submissionId_value_key" ON "SubmissionSubject"("submissionId", "value");
CREATE UNIQUE INDEX "SubmissionSubject_submissionId_sortOrder_key" ON "SubmissionSubject"("submissionId", "sortOrder");
CREATE INDEX "SubmissionDeclarationAcceptance_submissionId_accepted_idx" ON "SubmissionDeclarationAcceptance"("submissionId", "accepted");
CREATE UNIQUE INDEX "SubmissionDeclarationAcceptance_submissionId_declarationId_key" ON "SubmissionDeclarationAcceptance"("submissionId", "declarationId");
CREATE INDEX "SubmissionChecklistAcceptance_submissionId_accepted_idx" ON "SubmissionChecklistAcceptance"("submissionId", "accepted");
CREATE UNIQUE INDEX "SubmissionChecklistAcceptance_submissionId_checklistItemId_key" ON "SubmissionChecklistAcceptance"("submissionId", "checklistItemId");
CREATE UNIQUE INDEX "SubmissionVersion_submissionId_version_key" ON "SubmissionVersion"("submissionId", "version");
CREATE INDEX "SubmissionTimelineEvent_submissionId_createdAt_idx" ON "SubmissionTimelineEvent"("submissionId", "createdAt");

-- Tenant and ownership foreign keys
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_articleTypeId_fkey" FOREIGN KEY ("articleTypeId") REFERENCES "ArticleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionAuthor" ADD CONSTRAINT "SubmissionAuthor_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionAuthor" ADD CONSTRAINT "SubmissionAuthor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubmissionKeyword" ADD CONSTRAINT "SubmissionKeyword_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionSubject" ADD CONSTRAINT "SubmissionSubject_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionDeclarationAcceptance" ADD CONSTRAINT "SubmissionDeclarationAcceptance_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionDeclarationAcceptance" ADD CONSTRAINT "SubmissionDeclarationAcceptance_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "JournalDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionChecklistAcceptance" ADD CONSTRAINT "SubmissionChecklistAcceptance_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionChecklistAcceptance" ADD CONSTRAINT "SubmissionChecklistAcceptance_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "SubmissionChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionVersion" ADD CONSTRAINT "SubmissionVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionTimelineEvent" ADD CONSTRAINT "SubmissionTimelineEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
