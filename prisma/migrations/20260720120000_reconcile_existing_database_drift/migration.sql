-- This migration records objects that already existed in the shared database.
CREATE TYPE "public"."EnumTokenType" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

CREATE TABLE "public"."UserToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "type" "public"."EnumTokenType" NOT NULL,
    "userId" INTEGER NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."store_names"
ADD CONSTRAINT "store_names_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "UserToken_token_key" ON "public"."UserToken"("token");
CREATE INDEX "UserToken_expiresAt_idx" ON "public"."UserToken"("expiresAt");
CREATE INDEX "UserToken_isValid_idx" ON "public"."UserToken"("isValid");
CREATE INDEX "UserToken_token_idx" ON "public"."UserToken"("token");
CREATE INDEX "UserToken_type_idx" ON "public"."UserToken"("type");
CREATE INDEX "UserToken_userId_idx" ON "public"."UserToken"("userId");
