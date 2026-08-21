CREATE TYPE "FileVisibility" AS ENUM ('PRIVATE', 'EDITORIAL_TEAM', 'REVIEWER', 'AUTHOR', 'PUBLIC');
CREATE TYPE "FileScanStatus" AS ENUM ('AWAITING_UPLOAD', 'QUARANTINED', 'CLEAN', 'INFECTED', 'REJECTED');
CREATE TYPE "SubmissionFilePurpose" AS ENUM ('MANUSCRIPT', 'SUPPLEMENTARY', 'COVER_LETTER', 'RESPONSE');

CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "journalId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "declaredMime" TEXT NOT NULL,
    "detectedMime" TEXT,
    "size" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "uploadedAt" TIMESTAMPTZ,
    "scannedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoredFile_size_check" CHECK ("size" > 0 AND "size" <= 26214400)
);

CREATE TABLE "SubmissionFile" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "submissionId" UUID NOT NULL,
    "storedFileId" UUID NOT NULL,
    "purpose" "SubmissionFilePurpose" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");
CREATE INDEX "StoredFile_journalId_scanStatus_createdAt_idx" ON "StoredFile"("journalId", "scanStatus", "createdAt");
CREATE INDEX "StoredFile_uploaderId_createdAt_idx" ON "StoredFile"("uploaderId", "createdAt");
CREATE UNIQUE INDEX "SubmissionFile_storedFileId_key" ON "SubmissionFile"("storedFileId");
CREATE INDEX "SubmissionFile_submissionId_purpose_sortOrder_idx" ON "SubmissionFile"("submissionId", "purpose", "sortOrder");

ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
