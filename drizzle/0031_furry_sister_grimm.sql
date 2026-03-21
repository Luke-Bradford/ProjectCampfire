ALTER TABLE "polls" ALTER COLUMN "allow_multiple_votes" DROP DEFAULT;
ALTER TABLE "polls" ALTER COLUMN "allow_multiple_votes" SET DATA TYPE boolean USING allow_multiple_votes::boolean;
ALTER TABLE "polls" ALTER COLUMN "allow_multiple_votes" SET DEFAULT false;