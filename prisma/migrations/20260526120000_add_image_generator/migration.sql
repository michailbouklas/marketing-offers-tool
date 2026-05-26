-- CreateEnum
CREATE TYPE "GeneratedImageStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "finalPrompt" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "requestedWidth" INTEGER NOT NULL,
    "requestedHeight" INTEGER NOT NULL,
    "generationWidth" INTEGER NOT NULL,
    "generationHeight" INTEGER NOT NULL,
    "style" TEXT,
    "camera" TEXT,
    "aspectRatio" TEXT,
    "referenceIds" JSONB NOT NULL,
    "localPath" TEXT,
    "remoteUrl" TEXT,
    "status" "GeneratedImageStatus" NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedImage_userId_createdAt_idx" ON "GeneratedImage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferenceImage_userId_createdAt_idx" ON "ReferenceImage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceImage" ADD CONSTRAINT "ReferenceImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
