CREATE TYPE "JournalTemplateKind" AS ENUM ('AUTHOR_GUIDELINES', 'MANUSCRIPT_TEMPLATE', 'COPYRIGHT_NOTICE');

CREATE TABLE "JournalSection" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "journalId" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "JournalSection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalSection_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "JournalSection_journalId_slug_key" ON "JournalSection"("journalId", "slug");
CREATE INDEX "JournalSection_journalId_sortOrder_idx" ON "JournalSection"("journalId", "sortOrder");

CREATE TABLE "ArticleType" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "journalId" UUID NOT NULL,
  "sectionId" UUID,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "peerReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ArticleType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArticleType_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE,
  CONSTRAINT "ArticleType_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "JournalSection"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "ArticleType_journalId_slug_key" ON "ArticleType"("journalId", "slug");
CREATE INDEX "ArticleType_journalId_sortOrder_idx" ON "ArticleType"("journalId", "sortOrder");
CREATE INDEX "ArticleType_sectionId_idx" ON "ArticleType"("sectionId");

CREATE TABLE "SubmissionChecklistItem" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "journalId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SubmissionChecklistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionChecklistItem_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE
);

CREATE INDEX "SubmissionChecklistItem_journalId_sortOrder_idx" ON "SubmissionChecklistItem"("journalId", "sortOrder");

CREATE TABLE "JournalDeclaration" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "journalId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalDeclaration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalDeclaration_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "JournalDeclaration_journalId_code_version_key" ON "JournalDeclaration"("journalId", "code", "version");
CREATE INDEX "JournalDeclaration_journalId_code_isActive_idx" ON "JournalDeclaration"("journalId", "code", "isActive");

CREATE TABLE "JournalTemplate" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "journalId" UUID NOT NULL,
  "kind" "JournalTemplateKind" NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "JournalTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalTemplate_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "JournalTemplate_journalId_slug_key" ON "JournalTemplate"("journalId", "slug");
CREATE INDEX "JournalTemplate_journalId_kind_sortOrder_idx" ON "JournalTemplate"("journalId", "kind", "sortOrder");
