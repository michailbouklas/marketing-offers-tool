-- Baseline migration: captures BOLT tables that were created in the dev DB
-- outside of Prisma migrate. Created via `prisma db pull --print` and marked
-- as already applied via `prisma migrate resolve --applied`.

-- CreateTable
CREATE TABLE "api_BOLT_header" (
    "id" SERIAL NOT NULL,
    "documentid" VARCHAR(100) NOT NULL,
    "documentdate" TIMESTAMP(6),
    "invoicenumber" VARCHAR(254),
    "timeframe" VARCHAR(100),
    "scenario" INTEGER NOT NULL DEFAULT 1,
    "je1_date" TIMESTAMP(6),
    "je2_date" TIMESTAMP(6),
    "bpcode" VARCHAR(50),
    "bpname" VARCHAR(150),
    "bolt_storename" VARCHAR(150),
    "distributionrule" VARCHAR(50),
    "project" VARCHAR(50),
    "erpdatabase" VARCHAR(100),
    "totalpayout" DECIMAL(19,6),
    "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "erpsent" VARCHAR DEFAULT 'N',
    "erpcreatedat" TIMESTAMP(6),
    "erpcomments" VARCHAR(254),

    CONSTRAINT "PK_api_BOLT_header" PRIMARY KEY ("documentid")
);

-- CreateTable
CREATE TABLE "api_BOLT_lines" (
    "documentid" VARCHAR(50) NOT NULL,
    "linenumber" INTEGER NOT NULL,
    "je_number" INTEGER NOT NULL DEFAULT 1,
    "transtype" VARCHAR(20),
    "linedetails" VARCHAR(1000),
    "amount" DECIMAL(19,6),
    "vatamount" DECIMAL(19,6),
    "totalamount" DECIMAL(19,6),
    "accountcode" VARCHAR(50),
    "vatcode" VARCHAR(20),

    CONSTRAINT "PK_api_BOLT_lines" PRIMARY KEY ("documentid","je_number","linenumber")
);

-- CreateTable
CREATE TABLE "bolt_company_mappings" (
    "invoice_store_name" TEXT,
    "bp_code" REAL,
    "bp_name" TEXT,
    "distribution_rule" TEXT,
    "cost_center" TEXT,
    "erpdatabase" TEXT
);

-- CreateTable
CREATE TABLE "bolt_regex_patters" (
    "id" SERIAL NOT NULL,
    "regex" TEXT NOT NULL,
    "example" TEXT,
    "category" TEXT NOT NULL,
    "accountcode" INTEGER,
    "vatcode" TEXT,

    CONSTRAINT "bolt_regex_patters_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "api_BOLT_lines" ADD CONSTRAINT "api_BOLT_lines_documentid_fkey" FOREIGN KEY ("documentid") REFERENCES "api_BOLT_header"("documentid") ON DELETE CASCADE ON UPDATE NO ACTION;
