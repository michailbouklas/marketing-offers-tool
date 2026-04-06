CREATE TABLE "user_brand" (
    "userId" TEXT NOT NULL,
    "brandId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_brand_pkey" PRIMARY KEY ("userId", "brandId")
);

CREATE INDEX "user_brand_brandId_idx" ON "user_brand"("brandId");

ALTER TABLE "user_brand"
ADD CONSTRAINT "user_brand_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_brand"
ADD CONSTRAINT "user_brand_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;