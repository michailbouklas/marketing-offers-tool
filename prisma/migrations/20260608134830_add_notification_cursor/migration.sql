-- CreateTable
CREATE TABLE "notification_cursor" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastProcessedQueueId" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_cursor_pkey" PRIMARY KEY ("id")
);
