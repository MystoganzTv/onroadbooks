-- Auth security was already applied by 0015; this migration adds only load attribution.
ALTER TABLE "Load" ADD COLUMN "sourceKind" text;
--> statement-breakpoint
ALTER TABLE "Load" ADD COLUMN "sourceName" text;
