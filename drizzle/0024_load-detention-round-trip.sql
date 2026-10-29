ALTER TABLE "Load" ADD COLUMN "detentionPay" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Load" ADD COLUMN "roundTrip" boolean DEFAULT false NOT NULL;