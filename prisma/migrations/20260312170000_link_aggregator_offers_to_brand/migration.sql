-- CreateTable (brand was created outside Prisma; included here so shadow DB can replay cleanly)
CREATE TABLE IF NOT EXISTS "public"."brand" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "brand_slug_key" ON "public"."brand"("slug");

ALTER TABLE public.aggregator_offers
ADD COLUMN IF NOT EXISTS brand_id INTEGER;

ALTER TABLE public.aggregator_offers
DROP COLUMN brand_name;

ALTER TABLE public.aggregator_offers
ALTER COLUMN brand_id SET NOT NULL;

CREATE INDEX aggregator_offers_brand_id_idx
ON public.aggregator_offers (brand_id);

ALTER TABLE public.aggregator_offers
ADD CONSTRAINT aggregator_offers_brand_id_fkey
FOREIGN KEY (brand_id) REFERENCES public."brand"(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;
