-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "vatNumber" TEXT,
    "sapDatabaseId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_company" (
    "brandId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_company_pkey" PRIMARY KEY ("brandId","companyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_sapDatabaseId_key" ON "Company"("sapDatabaseId");

-- CreateIndex
CREATE INDEX "brand_company_companyId_idx" ON "brand_company"("companyId");

-- AddForeignKey
ALTER TABLE "brand_company" ADD CONSTRAINT "brand_company_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_company" ADD CONSTRAINT "brand_company_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Initial data: snapshot of energy-platform "Company" / brand_company (2026-11-06).
-- Elessos registrationNumber is copied verbatim; the source holds Greek "ΗΕ", not Latin "HE".
INSERT INTO "Company" ("name", "registrationNumber", "vatNumber", "active", "updatedAt") VALUES
  ('Alomco Properties Ltd', 'HE353727', NULL, true, CURRENT_TIMESTAMP),
  ('Avantage B&P Café Ltd', 'HE345321', '99000110H', true, CURRENT_TIMESTAMP),
  ('Avantage B&R Italian Restaurants Ltd', 'HE346553', '99000110H', true, CURRENT_TIMESTAMP),
  ('Catercom Ltd', 'HE57558', '99000110H', true, CURRENT_TIMESTAMP),
  ('Caylink Cafe Ltd', 'HE368483', '99000110H', true, CURRENT_TIMESTAMP),
  ('Dafera Ltd', 'HE183393', '99000110H', true, CURRENT_TIMESTAMP),
  ('Elessos Limited', 'ΗΕ442640', NULL, true, CURRENT_TIMESTAMP),
  ('Hetafre Trading Ltd', 'HE312807', '99000110H', true, CURRENT_TIMESTAMP),
  ('PHC Franchised Restaurants Public Ltd', 'HE44705', '99000110H', true, CURRENT_TIMESTAMP),
  ('WOW Burgers Ltd', 'HE328051', '99000110H', true, CURRENT_TIMESTAMP);

-- Energy brand names differ from ours, so the links are keyed by OUR brand names (trimmed:
-- "Pier One " / "Taco Bell " carry trailing spaces). Unknown names insert nothing.
-- Not linked: energy "Central Kitchen Engomi", "Alomco", "Elessos" (no such brand here);
-- Akashi has no company in energy.
INSERT INTO "brand_company" ("brandId", "companyId")
SELECT b."id", c."id"
FROM (VALUES
  ('Catercom Ltd', 'Hobo'),
  ('Catercom Ltd', 'To Kypriakon'),
  ('Catercom Ltd', 'Pier One'),
  ('Catercom Ltd', 'Remezzo'),
  ('Catercom Ltd', 'Tavernaki'),
  ('Catercom Ltd', 'Verde'),
  ('PHC Franchised Restaurants Public Ltd', 'KFC'),
  ('PHC Franchised Restaurants Public Ltd', 'Pizza Hut'),
  ('PHC Franchised Restaurants Public Ltd', 'Taco Bell'),
  ('WOW Burgers Ltd', 'Burger King'),
  ('Caylink Cafe Ltd', 'Caffe Nero'),
  ('Hetafre Trading Ltd', 'Caffe Nero'),
  ('Avantage B&P Café Ltd', 'Paul International'),
  ('Avantage B&R Italian Restaurants Ltd', 'Jamies Italian'),
  ('Dafera Ltd', 'Wagamama')
) AS m("company", "brand")
JOIN "Company" c ON c."name" = m."company"
JOIN "brand" b ON trim(b."name") = m."brand";

-- GL databaseId per company (verified against dbo.sapbw_gl 2026-11-06). Not mapped:
-- Alomco / Elessos (no GL data); CUCAFEDB and ODLONEDB have no Company.
UPDATE "Company" c SET "sapDatabaseId" = m."id"
FROM (VALUES
  ('Avantage B&P Café Ltd', 'AVANTAGECAFEDB'),
  ('Avantage B&R Italian Restaurants Ltd', 'AVANTAGERESTDB'),
  ('Catercom Ltd', 'CATERCOM_EUR'),
  ('Caylink Cafe Ltd', 'CAYLINK_EUR'),
  ('Dafera Ltd', 'DAFERA_PROD_EUR'),
  ('Hetafre Trading Ltd', 'HETAFRE_EUR'),
  ('PHC Franchised Restaurants Public Ltd', 'PHC_EUR'),
  ('WOW Burgers Ltd', 'WOWBURGERSDB')
) AS m("name", "id")
WHERE c."name" = m."name";
