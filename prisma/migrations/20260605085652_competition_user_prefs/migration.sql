-- CreateEnum
CREATE TYPE "CompetitionTrackState" AS ENUM ('tracked', 'ignored');

-- CreateTable
CREATE TABLE "competition_user_restaurant_pref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processorId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "state" "CompetitionTrackState" NOT NULL DEFAULT 'tracked',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_user_restaurant_pref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_dashboard_widget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_dashboard_widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competition_user_restaurant_pref_userId_state_idx" ON "competition_user_restaurant_pref"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "competition_user_restaurant_pref_userId_processorId_restaur_key" ON "competition_user_restaurant_pref"("userId", "processorId", "restaurantId");

-- CreateIndex
CREATE INDEX "competition_dashboard_widget_userId_position_idx" ON "competition_dashboard_widget"("userId", "position");

-- AddForeignKey
ALTER TABLE "competition_user_restaurant_pref" ADD CONSTRAINT "competition_user_restaurant_pref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_dashboard_widget" ADD CONSTRAINT "competition_dashboard_widget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
