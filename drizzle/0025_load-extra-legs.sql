ALTER TABLE "Load" ADD COLUMN "extraLegs" JSONB NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
-- Loads saved with the short-lived round-trip switch become one leg back,
-- miles left at 0 for the owner to fill in. The flag is cleared, not dropped,
-- so the build still serving during rollout keeps reading the column.
UPDATE "Load"
SET "extraLegs" = jsonb_build_array(jsonb_build_object(
      'pickupDate', to_char(COALESCE("deliveryDate", "date"), 'YYYY-MM-DD'),
      'deliveryDate', NULL,
      'originCity', "destinationCity", 'originState', "destinationState",
      'destinationCity', "originCity", 'destinationState', "originState",
      'miles', 0)),
    "roundTrip" = false
WHERE "roundTrip" = true;