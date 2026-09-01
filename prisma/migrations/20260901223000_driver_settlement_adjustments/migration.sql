-- Add the operational additions and reductions that turn frozen base pay into
-- a complete driver statement. These remain deliberately separate from tax,
-- withholding and banking data: OnRoad Books is not a payroll processor.
CREATE TYPE "DriverSettlementAdjustmentType" AS ENUM (
  'ACCESSORIAL_PAY',
  'REIMBURSEMENT',
  'DEDUCTION',
  'ADVANCE',
  'OTHER_EARNING'
);

CREATE TABLE "DriverSettlementAdjustment" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "type" "DriverSettlementAdjustmentType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverSettlementAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverSettlementAdjustment_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "DriverSettlementAdjustment_reason_present" CHECK (char_length(trim("reason")) >= 2)
);

CREATE INDEX "DriverSettlementAdjustment_settlementId_createdAt_idx"
  ON "DriverSettlementAdjustment"("settlementId", "createdAt");

ALTER TABLE "DriverSettlementAdjustment"
  ADD CONSTRAINT "DriverSettlementAdjustment_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "DriverSettlement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
