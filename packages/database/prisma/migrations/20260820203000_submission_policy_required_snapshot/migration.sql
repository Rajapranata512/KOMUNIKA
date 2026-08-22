ALTER TABLE "SubmissionDeclarationAcceptance"
ADD COLUMN "requiredSnapshot" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "SubmissionChecklistAcceptance"
ADD COLUMN "requiredSnapshot" BOOLEAN NOT NULL DEFAULT true;
