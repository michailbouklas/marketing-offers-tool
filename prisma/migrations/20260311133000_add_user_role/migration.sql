ALTER TABLE "user"
ADD COLUMN "role" TEXT DEFAULT 'user';

UPDATE "user"
SET "role" = 'user'
WHERE "role" IS NULL;
