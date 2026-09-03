-- Existing businesses remain conservative until the owner explicitly chooses
-- a deterministic Fleet allocation method in Settings.
ALTER TABLE "FinancialSettings"
ADD COLUMN "fleetOverheadAllocation" TEXT NOT NULL DEFAULT 'UNALLOCATED';

ALTER TABLE "FinancialSettings"
ADD CONSTRAINT "FinancialSettings_fleetOverheadAllocation_check"
CHECK ("fleetOverheadAllocation" IN ('UNALLOCATED', 'FLEET_MILES'));
