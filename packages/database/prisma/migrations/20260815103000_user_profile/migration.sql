ALTER TABLE "User"
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "affiliation" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "expertise" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "orcidId" TEXT,
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'id-ID',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';

ALTER TABLE "User"
  ADD CONSTRAINT "User_countryCode_check"
  CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$');

ALTER TABLE "User"
  ADD CONSTRAINT "User_orcidId_check"
  CHECK ("orcidId" IS NULL OR "orcidId" ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$');
