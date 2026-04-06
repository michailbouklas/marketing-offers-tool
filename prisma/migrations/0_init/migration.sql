-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Aggregator" AS ENUM ('foody', 'bolt', 'wolt', 'efood');

-- CreateTable
CREATE TABLE "public"."aggregator_offers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "aggregator" "public"."Aggregator" NOT NULL,
    "brand_name" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "aggregator_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."api_WOLT_header" (
    "id" SERIAL NOT NULL,
    "documentid" TEXT NOT NULL,
    "documentdate" TIMESTAMP(3),
    "invoicenumber" TEXT,
    "timeframe" TEXT,
    "remarks" TEXT,
    "bpcode" TEXT,
    "bpname" TEXT,
    "partnername" TEXT,
    "distributionrule" TEXT,
    "project" TEXT,
    "erpdatabase" TEXT,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erpsent" TEXT DEFAULT 'N',
    "erpcreatedat" TIMESTAMP(3),
    "totalpayout" DECIMAL(19,6),

    CONSTRAINT "api_WOLT_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."api_WOLT_lines" (
    "documentid" TEXT NOT NULL,
    "linenumber" INTEGER NOT NULL,
    "transtype" TEXT,
    "linedetails" TEXT,
    "amount" DECIMAL(19,6),
    "vatamount" DECIMAL(19,6),
    "totalamount" DECIMAL(19,6),
    "accountcode" TEXT,
    "vatcode" TEXT,

    CONSTRAINT "api_WOLT_lines_pkey" PRIMARY KEY ("documentid","linenumber")
);

-- CreateTable
CREATE TABLE "public"."error_log" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "source" TEXT,

    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."regex_patterns_by_category" (
    "id" SERIAL NOT NULL,
    "regex" TEXT NOT NULL,
    "example" TEXT,
    "category" TEXT NOT NULL,

    CONSTRAINT "regex_patterns_by_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."store_names" (
    "id" SERIAL NOT NULL,
    "file_name" VARCHAR,
    "pdf_name" VARCHAR,
    "aggregator_name" VARCHAR
);

-- CreateTable
CREATE TABLE "public"."wolt_regex_patters" (
    "id" SERIAL NOT NULL,
    "regex" TEXT NOT NULL,
    "example" TEXT,
    "category" TEXT NOT NULL,

    CONSTRAINT "wolt_regex_patters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_WOLT_header_documentid_key" ON "public"."api_WOLT_header"("documentid" ASC);

-- AddForeignKey
ALTER TABLE "public"."api_WOLT_lines" ADD CONSTRAINT "api_WOLT_lines_documentid_fkey" FOREIGN KEY ("documentid") REFERENCES "public"."api_WOLT_header"("documentid") ON DELETE CASCADE ON UPDATE CASCADE;
