-- Unknown remains the default. Only explicit owner exemptions are persisted;
-- recorded coverage is derived from the expense ledger in the same cost window.
ALTER TABLE "Truck"
ADD COLUMN "operatingCostExemptions" JSONB NOT NULL DEFAULT '{}'::jsonb;
