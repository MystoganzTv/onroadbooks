ALTER TABLE "FinancialObligation"
  ADD COLUMN "startingBalance" DECIMAL(12,2),
  ADD COLUMN "aprPercent" DECIMAL(5,2),
  ADD COLUMN "paymentDueDay" INTEGER;
