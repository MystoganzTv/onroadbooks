ALTER TABLE "Load" ADD COLUMN "claimDeduction" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Load" ADD COLUMN "claimReason" text;