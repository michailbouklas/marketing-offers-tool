-- CreateTable
CREATE TABLE "GenerationFailureLog" (
    "id" TEXT NOT NULL,
    "generatedImageId" TEXT NOT NULL,
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

    CONSTRAINT "GenerationFailureLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationFailureLog_createdAt_idx" ON "GenerationFailureLog"("createdAt");

-- CreateIndex
CREATE INDEX "GenerationFailureLog_generatedImageId_idx" ON "GenerationFailureLog"("generatedImageId");

-- AddForeignKey
ALTER TABLE "GenerationFailureLog" ADD CONSTRAINT "GenerationFailureLog_generatedImageId_fkey" FOREIGN KEY ("generatedImageId") REFERENCES "GeneratedImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
