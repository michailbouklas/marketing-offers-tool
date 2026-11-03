-- CreateTable
CREATE TABLE "sales_offer_value_cache" (
    "brandAlias" VARCHAR(64) NOT NULL,
    "rows" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_offer_value_cache_pkey" PRIMARY KEY ("brandAlias")
);

