-- Search vectors are generated SQL columns and are not represented in Prisma.
-- Remove only these derived columns before schema push; extensions.sql rebuilds
-- them and their GIN indexes immediately afterward.
ALTER TABLE IF EXISTS "ExamPaper" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE IF EXISTS "Question" DROP COLUMN IF EXISTS "search_vector";
