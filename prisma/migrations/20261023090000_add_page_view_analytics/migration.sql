-- CreateTable
CREATE TABLE "page_view" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "tabId" UUID NOT NULL,
    "routeId" VARCHAR(256),
    "path" VARCHAR(512) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visible" BOOLEAN NOT NULL,
    "foregroundMs" INTEGER NOT NULL DEFAULT 0,
    "totalMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "page_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_view_daily" (
    "day" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "routeId" VARCHAR(256) NOT NULL,
    "views" INTEGER NOT NULL,
    "foregroundMs" BIGINT NOT NULL,
    "totalMs" BIGINT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_view_daily_pkey" PRIMARY KEY ("day","userId","routeId")
);

-- CreateTable
CREATE TABLE "user_visit_daily" (
    "day" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "visits" INTEGER NOT NULL,
    "pageViews" INTEGER NOT NULL,
    "foregroundMs" BIGINT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_visit_daily_pkey" PRIMARY KEY ("day","userId")
);

-- CreateTable
CREATE TABLE "page_view_rollup_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rolledUpThrough" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_view_rollup_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_view_userId_startedAt_idx" ON "page_view"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "page_view_startedAt_idx" ON "page_view"("startedAt");

-- CreateIndex
CREATE INDEX "page_view_daily_userId_day_idx" ON "page_view_daily"("userId", "day");

-- CreateIndex
CREATE INDEX "user_visit_daily_userId_day_idx" ON "user_visit_daily"("userId", "day");

-- AddForeignKey
ALTER TABLE "page_view" ADD CONSTRAINT "page_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_view_daily" ADD CONSTRAINT "page_view_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_visit_daily" ADD CONSTRAINT "user_visit_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

