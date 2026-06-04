-- CreateEnum
CREATE TYPE "ImageGeneratorTemplateVisibility" AS ENUM ('private', 'public');

-- CreateTable
CREATE TABLE "ImageGeneratorPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGeneratorPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGeneratorTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "visibility" "ImageGeneratorTemplateVisibility" NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGeneratorTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGeneratorTemplateBrand" (
    "templateId" TEXT NOT NULL,
    "brandId" INTEGER NOT NULL,

    CONSTRAINT "ImageGeneratorTemplateBrand_pkey" PRIMARY KEY ("templateId","brandId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageGeneratorPreset_userId_name_key" ON "ImageGeneratorPreset"("userId", "name");

-- CreateIndex
CREATE INDEX "ImageGeneratorPreset_userId_updatedAt_idx" ON "ImageGeneratorPreset"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGeneratorTemplate_userId_name_key" ON "ImageGeneratorTemplate"("userId", "name");

-- CreateIndex
CREATE INDEX "ImageGeneratorTemplate_visibility_updatedAt_idx" ON "ImageGeneratorTemplate"("visibility", "updatedAt");

-- CreateIndex
CREATE INDEX "ImageGeneratorTemplate_userId_updatedAt_idx" ON "ImageGeneratorTemplate"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ImageGeneratorTemplateBrand_brandId_idx" ON "ImageGeneratorTemplateBrand"("brandId");

-- AddForeignKey
ALTER TABLE "ImageGeneratorPreset" ADD CONSTRAINT "ImageGeneratorPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGeneratorTemplate" ADD CONSTRAINT "ImageGeneratorTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGeneratorTemplateBrand" ADD CONSTRAINT "ImageGeneratorTemplateBrand_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ImageGeneratorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGeneratorTemplateBrand" ADD CONSTRAINT "ImageGeneratorTemplateBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
