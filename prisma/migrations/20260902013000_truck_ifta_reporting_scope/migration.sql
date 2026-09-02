-- IFTA filing scope is an owner-confirmed decision per power unit. Existing
-- trucks remain NULL so a migration never silently includes or excludes them.
ALTER TABLE "Truck"
  ADD COLUMN "iftaReportingEnabled" BOOLEAN;
