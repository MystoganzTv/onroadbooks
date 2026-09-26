ALTER TABLE "FinancialSettings" ALTER COLUMN "ratingGreatPerMile" SET DEFAULT 1.25;--> statement-breakpoint
ALTER TABLE "FinancialSettings" ALTER COLUMN "ratingGoodPerMile" SET DEFAULT 0.9;--> statement-breakpoint
ALTER TABLE "FinancialSettings" ALTER COLUMN "ratingMarginalPerMile" SET DEFAULT 0.6;--> statement-breakpoint
-- ADR-0031: an owner-operator load carries no driver wage, so contribution per
-- mile runs higher. Businesses still on the previous factory floors
-- ($1.00 / $0.60 / $0.30) move to $1.25 / $0.90 / $0.60; any owner who set
-- their own floors keeps them.
UPDATE "FinancialSettings"
SET "ratingGreatPerMile" = 1.25, "ratingGoodPerMile" = 0.9, "ratingMarginalPerMile" = 0.6
WHERE "ratingGreatPerMile" = 1 AND "ratingGoodPerMile" = 0.6 AND "ratingMarginalPerMile" = 0.3;
