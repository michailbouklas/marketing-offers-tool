ALTER TABLE "user"
ADD COLUMN "banned" BOOLEAN DEFAULT false,
ADD COLUMN "banReason" TEXT,
ADD COLUMN "banExpires" TIMESTAMP(3);

UPDATE "user"
SET "banned" = false
WHERE "banned" IS NULL;

ALTER TABLE "session"
ADD COLUMN "impersonatedBy" TEXT;
