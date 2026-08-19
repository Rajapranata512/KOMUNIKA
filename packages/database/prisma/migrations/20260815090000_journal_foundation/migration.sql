CREATE TYPE "JournalRole" AS ENUM ('AUTHOR', 'REVIEWER', 'COPYEDITOR', 'PRODUCTION_EDITOR', 'SECTION_EDITOR', 'EDITOR_IN_CHIEF', 'JOURNAL_MANAGER');
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "ReviewModel" AS ENUM ('SINGLE_ANONYMOUS', 'DOUBLE_ANONYMOUS');

CREATE TABLE "Journal" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "abbreviation" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "printIssn" TEXT,
  "electronicIssn" TEXT,
  "primaryLanguage" TEXT NOT NULL DEFAULT 'id',
  "reviewModel" "ReviewModel" NOT NULL DEFAULT 'DOUBLE_ANONYMOUS',
  "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
  "submissionsOpen" BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Journal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Journal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Journal_slug_key" ON "Journal"("slug");
CREATE INDEX "Journal_status_title_idx" ON "Journal"("status", "title");

CREATE TABLE "JournalMembership" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "journalId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "JournalRole" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalMembership_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE,
  CONSTRAINT "JournalMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "JournalMembership_journalId_userId_role_key" ON "JournalMembership"("journalId", "userId", "role");
CREATE INDEX "JournalMembership_userId_journalId_idx" ON "JournalMembership"("userId", "journalId");
CREATE INDEX "JournalMembership_journalId_role_idx" ON "JournalMembership"("journalId", "role");
