-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "isOwnerOperator" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FinancialSettings" ALTER COLUMN "ratingGreatPerMile" SET DEFAULT 1,
ALTER COLUMN "ratingGoodPerMile" SET DEFAULT 0.6,
ALTER COLUMN "ratingMarginalPerMile" SET DEFAULT 0.3;

-- ADR-0028: businesses still on the old factory floors move to the new
-- defaults; any owner who set their own floors keeps them.
UPDATE "FinancialSettings"
SET "ratingGreatPerMile" = 1, "ratingGoodPerMile" = 0.6, "ratingMarginalPerMile" = 0.3
WHERE "ratingGreatPerMile" = 2 AND "ratingGoodPerMile" = 1.5 AND "ratingMarginalPerMile" = 1;
