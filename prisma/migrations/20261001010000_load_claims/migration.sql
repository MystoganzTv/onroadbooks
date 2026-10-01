-- What the broker took off the rate after delivery (damage, shortage, late fee).
ALTER TABLE "Load" ADD COLUMN "claimDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0, ADD COLUMN "claimReason" TEXT;
