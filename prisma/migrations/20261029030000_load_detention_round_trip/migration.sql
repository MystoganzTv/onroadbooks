-- Detention paid on top of the rate, and loads that go out and come back loaded on one rate.
ALTER TABLE "Load" ADD COLUMN "detentionPay" DECIMAL(12,2) NOT NULL DEFAULT 0, ADD COLUMN "roundTrip" BOOLEAN NOT NULL DEFAULT false;
