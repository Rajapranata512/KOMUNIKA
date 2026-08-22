ALTER TABLE "Issue" ADD COLUMN "coverFileId" UUID;

CREATE UNIQUE INDEX "Issue_coverFileId_key" ON "Issue"("coverFileId");

ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_coverFileId_fkey"
FOREIGN KEY ("coverFileId") REFERENCES "StoredFile"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
