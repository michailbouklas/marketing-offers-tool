-- CreateEnum
CREATE TYPE "MonitorSection" AS ENUM ('competition', 'googleReviews');

-- CreateTable
CREATE TABLE "user_monitor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "MonitorSection" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_monitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_monitor_userId_section_idx" ON "user_monitor"("userId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "user_monitor_userId_section_entityId_key" ON "user_monitor"("userId", "section", "entityId");

-- AddForeignKey
ALTER TABLE "user_monitor" ADD CONSTRAINT "user_monitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
