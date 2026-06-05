-- CreateEnum
CREATE TYPE "CopyType" AS ENUM ('aggregator_offer', 'social_caption', 'push_sms', 'banner_headline');

-- CreateEnum
CREATE TYPE "GeneratedCopyStatus" AS ENUM ('completed', 'failed');

-- CreateTable
CREATE TABLE "GeneratedCopy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" INTEGER,
    "offerId" INTEGER,
    "copyType" "CopyType" NOT NULL,
    "channel" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "tone" TEXT,
    "finalPrompt" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "variants" JSONB NOT NULL,
    "status" "GeneratedCopyStatus" NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyGenerationFailureLog" (
    "id" TEXT NOT NULL,
    "generatedCopyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "attempt" INTEGER NOT NULL,
    "errorName" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "requestSnapshot" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopyGenerationFailureLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedCopy_userId_createdAt_idx" ON "GeneratedCopy"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedCopy_brandId_createdAt_idx" ON "GeneratedCopy"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "CopyGenerationFailureLog_createdAt_idx" ON "CopyGenerationFailureLog"("createdAt");

-- CreateIndex
CREATE INDEX "CopyGenerationFailureLog_generatedCopyId_idx" ON "CopyGenerationFailureLog"("generatedCopyId");

-- AddForeignKey
ALTER TABLE "GeneratedCopy" ADD CONSTRAINT "GeneratedCopy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedCopy" ADD CONSTRAINT "GeneratedCopy_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyGenerationFailureLog" ADD CONSTRAINT "CopyGenerationFailureLog_generatedCopyId_fkey" FOREIGN KEY ("generatedCopyId") REFERENCES "GeneratedCopy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
