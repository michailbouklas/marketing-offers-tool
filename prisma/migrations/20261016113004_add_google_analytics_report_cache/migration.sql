-- CreateEnum
CREATE TYPE "GaRefreshJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "google_analytics_report_cache" (
    "propertyRowId" TEXT NOT NULL,
    "range" VARCHAR(16) NOT NULL,
    "reportKey" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_analytics_report_cache_pkey" PRIMARY KEY ("propertyRowId","range","reportKey")
);

-- CreateTable
CREATE TABLE "google_analytics_refresh_job" (
    "id" SERIAL NOT NULL,
    "propertyRowId" TEXT NOT NULL,
    "range" VARCHAR(16) NOT NULL,
    "reportKeys" TEXT[],
    "status" "GaRefreshJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "lastStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "google_analytics_refresh_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "google_analytics_report_cache_fetchedAt_idx" ON "google_analytics_report_cache"("fetchedAt");

-- CreateIndex
CREATE INDEX "google_analytics_refresh_job_status_nextRunAt_idx" ON "google_analytics_refresh_job"("status", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "google_analytics_refresh_job_propertyRowId_range_key" ON "google_analytics_refresh_job"("propertyRowId", "range");

-- AddForeignKey
ALTER TABLE "google_analytics_report_cache" ADD CONSTRAINT "google_analytics_report_cache_propertyRowId_fkey" FOREIGN KEY ("propertyRowId") REFERENCES "brand_google_analytics_property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_analytics_refresh_job" ADD CONSTRAINT "google_analytics_refresh_job_propertyRowId_fkey" FOREIGN KEY ("propertyRowId") REFERENCES "brand_google_analytics_property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
