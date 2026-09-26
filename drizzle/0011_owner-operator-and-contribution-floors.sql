ALTER TABLE "FinancialSettings" ALTER COLUMN "ratingGreatPerMile" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "FinancialSettings" ALTER COLUMN "ratingGoodPerMile" SET DEFAULT 0.6;--> statement-breakpoint
ALTER TABLE "FinancialSettings" ALTER COLUMN "ratingMarginalPerMile" SET DEFAULT 0.3;--> statement-breakpoint
ALTER TABLE "Driver" ADD COLUMN "isOwnerOperator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- ADR-0028: the old floors ($2.00 / $1.50 / $1.00 per mile) were on the
-- gross-rate scale but judged contribution after driver pay. Businesses still
-- on those exact factory values move to the new defaults; any owner who set
-- their own floors keeps them.
UPDATE "FinancialSettings"
SET "ratingGreatPerMile" = 1, "ratingGoodPerMile" = 0.6, "ratingMarginalPerMile" = 0.3
WHERE "ratingGreatPerMile" = 2 AND "ratingGoodPerMile" = 1.5 AND "ratingMarginalPerMile" = 1;
