ALTER TABLE "Broker" ADD COLUMN "contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- ADR-0029: a broker is the company; the people there are contacts. Copy the
-- one legacy contact of each profile into `contacts` (keeping the phone the
-- extension belonged to), then clear the per-person fields it came from so
-- the same person is not read twice. "phone" stays as the company's line.
UPDATE "Broker"
SET "contacts" = jsonb_build_array(jsonb_build_object(
      'id', 'bc_' || "id",
      'name', btrim("contactName"),
      'phone', "phone",
      'phoneExtension', "phoneExtension",
      'email', "email",
      'notes', NULL
    )),
    "contactName" = NULL,
    "phoneExtension" = NULL,
    "email" = NULL
WHERE "contactName" IS NOT NULL AND btrim("contactName") <> '' AND "contacts" = '[]'::jsonb;
