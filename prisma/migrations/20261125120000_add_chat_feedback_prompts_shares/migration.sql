-- CreateTable
CREATE TABLE "ChatFeedback" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPrompt" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "brandAliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatFeedback_agentId_createdAt_idx" ON "ChatFeedback"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatFeedback_userId_messageId_key" ON "ChatFeedback"("userId", "messageId");

-- CreateIndex
CREATE INDEX "ChatPrompt_agentId_published_idx" ON "ChatPrompt"("agentId", "published");

-- CreateIndex
CREATE INDEX "ChatPrompt_userId_idx" ON "ChatPrompt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatShare_userId_agentId_sessionKey_key" ON "ChatShare"("userId", "agentId", "sessionKey");

-- AddForeignKey
ALTER TABLE "ChatFeedback" ADD CONSTRAINT "ChatFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPrompt" ADD CONSTRAINT "ChatPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatShare" ADD CONSTRAINT "ChatShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

