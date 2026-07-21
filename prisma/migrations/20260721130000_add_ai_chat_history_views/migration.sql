-- AI chat history lives in Mastra-owned tables in the "mastra" schema
-- (created and migrated by @mastra/pg, never by Prisma). These read-only
-- views expose per-user chat sessions and messages to the app with Prisma
-- Client types, without Prisma Migrate taking ownership of the underlying
-- tables.
--
-- The IF NOT EXISTS statements exist only so the shadow database used by
-- `prisma migrate dev` can replay this migration; on real databases the
-- schema and tables were already created by @mastra/pg and these are no-ops.
CREATE SCHEMA IF NOT EXISTS "mastra";

CREATE TABLE IF NOT EXISTS "mastra"."mastra_threads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL,
    "createdAtZ" TIMESTAMPTZ,
    "updatedAtZ" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "mastra"."mastra_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL,
    "resourceId" TEXT,
    "createdAtZ" TIMESTAMPTZ
);

CREATE VIEW "public"."ai_chat_threads" AS
SELECT "id", "resourceId", "title", "metadata", "createdAt", "updatedAt"
FROM "mastra"."mastra_threads";

CREATE VIEW "public"."ai_chat_messages" AS
SELECT "id", "thread_id", "content", "role", "type", "createdAt", "resourceId"
FROM "mastra"."mastra_messages";
