-- CreateEnum
CREATE TYPE "GoogleReviewsPrefState" AS ENUM ('monitored', 'ignored');

-- CreateTable
CREATE TABLE "google_reviews_user_business_pref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessCid" TEXT NOT NULL,
    "state" "GoogleReviewsPrefState" NOT NULL DEFAULT 'monitored',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_reviews_user_business_pref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_reviews_dashboard_widget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_reviews_dashboard_widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "google_reviews_user_business_pref_userId_state_idx" ON "google_reviews_user_business_pref"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "google_reviews_user_business_pref_userId_businessCid_key" ON "google_reviews_user_business_pref"("userId", "businessCid");

-- CreateIndex
CREATE INDEX "google_reviews_dashboard_widget_userId_position_idx" ON "google_reviews_dashboard_widget"("userId", "position");

-- AddForeignKey
ALTER TABLE "google_reviews_user_business_pref" ADD CONSTRAINT "google_reviews_user_business_pref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_reviews_dashboard_widget" ADD CONSTRAINT "google_reviews_dashboard_widget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
