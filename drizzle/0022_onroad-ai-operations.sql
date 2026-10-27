ALTER TABLE "AssistantUsage" ADD COLUMN "aiCostMicros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "AssistantUsage" ADD COLUMN "transcribeCostMicros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "AssistantUsage" ADD COLUMN "whatsappCostMicros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "plan" text DEFAULT 'FREE' NOT NULL;--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "planStatus" text;--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "planCurrentPeriodEnd" timestamp (3);--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "planAmountCents" integer;--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "stripeCustomerId" text;--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "stripeSubscriptionId" text;--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "blockedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "blockedReason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "AssistantUser_stripeSubscriptionId_key" ON "AssistantUser" USING btree ("stripeSubscriptionId");--> statement-breakpoint
CREATE INDEX "AssistantUser_stripeCustomerId_idx" ON "AssistantUser" USING btree ("stripeCustomerId");--> statement-breakpoint
CREATE INDEX "AssistantUser_createdAt_idx" ON "AssistantUser" USING btree ("createdAt");--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD CONSTRAINT "AssistantUser_plan_check" CHECK ("AssistantUser"."plan" IN ('FREE', 'PRO'));