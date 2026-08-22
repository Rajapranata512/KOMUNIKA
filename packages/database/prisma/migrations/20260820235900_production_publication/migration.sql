-- CreateEnum
CREATE TYPE "ProductionStage" AS ENUM ('COPYEDITING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'WITHDRAWN', 'RETRACTED');

-- CreateEnum
CREATE TYPE "GalleyFormat" AS ENUM ('PDF', 'HTML', 'EPUB', 'XML');

-- CreateEnum
CREATE TYPE "ProductionQueryStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PublicationUpdateType" AS ENUM ('CORRECTION', 'WITHDRAWAL', 'RETRACTION');

-- CreateTable
CREATE TABLE "ProductionAssignment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "assigneeId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "stage" "ProductionStage" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ,

    CONSTRAINT "ProductionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionQuery" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "openedById" UUID NOT NULL,
    "respondedById" UUID,
    "question" TEXT NOT NULL,
    "response" TEXT NOT NULL DEFAULT '',
    "status" "ProductionQueryStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,

    CONSTRAINT "ProductionQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "volume" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "IssueStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMPTZ,
    "publishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "issueId" UUID,
    "slug" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "articleOrder" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMPTZ,
    "publishedAt" TIMESTAMPTZ,
    "publicationKey" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationVersion" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "sourceVersionId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "abstract" TEXT NOT NULL,
    "authors" JSONB NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'id',
    "licenseName" TEXT NOT NULL,
    "licenseUrl" TEXT NOT NULL,
    "copyrightHolder" TEXT NOT NULL,
    "pages" TEXT,
    "eLocator" TEXT,
    "doi" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Galley" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "publicationVersionId" UUID NOT NULL,
    "storedFileId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "format" "GalleyFormat" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'id',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Galley_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationUpdate" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "type" "PublicationUpdateType" NOT NULL,
    "reason" TEXT NOT NULL,
    "notice" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionAssignment_journalId_stage_active_idx" ON "ProductionAssignment"("journalId", "stage", "active");

-- CreateIndex
CREATE INDEX "ProductionAssignment_submissionId_stage_active_idx" ON "ProductionAssignment"("submissionId", "stage", "active");

-- CreateIndex
CREATE INDEX "ProductionAssignment_assigneeId_stage_active_idx" ON "ProductionAssignment"("assigneeId", "stage", "active");

-- CreateIndex
CREATE INDEX "ProductionQuery_submissionId_status_createdAt_idx" ON "ProductionQuery"("submissionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionQuery_journalId_status_createdAt_idx" ON "ProductionQuery"("journalId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Issue_journalId_status_year_idx" ON "Issue"("journalId", "status", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_journalId_slug_key" ON "Issue"("journalId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_journalId_volume_number_year_key" ON "Issue"("journalId", "volume", "number", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_submissionId_key" ON "Publication"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_publicationKey_key" ON "Publication"("publicationKey");

-- CreateIndex
CREATE INDEX "Publication_journalId_status_publishedAt_idx" ON "Publication"("journalId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Publication_issueId_articleOrder_idx" ON "Publication"("issueId", "articleOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_journalId_slug_key" ON "Publication"("journalId", "slug");

-- CreateIndex
CREATE INDEX "PublicationVersion_journalId_createdAt_idx" ON "PublicationVersion"("journalId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationVersion_publicationId_version_key" ON "PublicationVersion"("publicationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Galley_storedFileId_key" ON "Galley"("storedFileId");

-- CreateIndex
CREATE INDEX "Galley_publicationVersionId_sortOrder_idx" ON "Galley"("publicationVersionId", "sortOrder");

-- CreateIndex
CREATE INDEX "PublicationUpdate_publicationId_effectiveAt_idx" ON "PublicationUpdate"("publicationId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PublicationUpdate_journalId_type_effectiveAt_idx" ON "PublicationUpdate"("journalId", "type", "effectiveAt");

-- AddForeignKey
ALTER TABLE "ProductionAssignment" ADD CONSTRAINT "ProductionAssignment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAssignment" ADD CONSTRAINT "ProductionAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAssignment" ADD CONSTRAINT "ProductionAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAssignment" ADD CONSTRAINT "ProductionAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQuery" ADD CONSTRAINT "ProductionQuery_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQuery" ADD CONSTRAINT "ProductionQuery_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQuery" ADD CONSTRAINT "ProductionQuery_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQuery" ADD CONSTRAINT "ProductionQuery_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationVersion" ADD CONSTRAINT "PublicationVersion_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationVersion" ADD CONSTRAINT "PublicationVersion_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationVersion" ADD CONSTRAINT "PublicationVersion_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationVersion" ADD CONSTRAINT "PublicationVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Galley" ADD CONSTRAINT "Galley_publicationVersionId_fkey" FOREIGN KEY ("publicationVersionId") REFERENCES "PublicationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Galley" ADD CONSTRAINT "Galley_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationUpdate" ADD CONSTRAINT "PublicationUpdate_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationUpdate" ADD CONSTRAINT "PublicationUpdate_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationUpdate" ADD CONSTRAINT "PublicationUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
