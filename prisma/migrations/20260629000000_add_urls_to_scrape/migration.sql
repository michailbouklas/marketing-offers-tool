-- CreateTable
CREATE TABLE "urls_to_scrape" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "aggregator" "Aggregator" NOT NULL,
    "userId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "urls_to_scrape_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "urls_to_scrape_userId_idx" ON "urls_to_scrape"("userId");

-- AddForeignKey
ALTER TABLE "urls_to_scrape" ADD CONSTRAINT "urls_to_scrape_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
