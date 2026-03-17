-- NOTE: Rows that existed before this migration will receive a created_at value of
-- the migration run time (DEFAULT now()), not their original insertion timestamp.
-- This is acceptable: the column is used only for "recently_added" sort in the
-- games library, and pre-migration rows will sort together at the migration date.
ALTER TABLE "game_ownerships" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
