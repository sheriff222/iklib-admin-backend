-- Raw extensions applied AFTER `prisma db push` (Prisma cannot author these natively).
-- Run with: npx prisma db execute --file prisma/extensions.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- Full-text search vectors (generated, stored) + GIN indexes.
ALTER TABLE "ExamPaper" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("hierarchyName", ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS "exampaper_search_idx" ON "ExamPaper" USING GIN ("search_vector");

ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("text", ''))) STORED;
CREATE INDEX IF NOT EXISTS "question_search_idx" ON "Question" USING GIN ("search_vector");

-- pgvector similarity index (cosine). ivfflat needs at least one row inserted
-- before it can be created with a non-default lists value; lists=100 is fine for dev.
CREATE INDEX IF NOT EXISTS "question_embedding_idx"
  ON "Question" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
