CREATE TABLE "AssistantAlert" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"lastCheckedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AssistantAlertMatch" (
	"id" text PRIMARY KEY NOT NULL,
	"alertId" text NOT NULL,
	"userId" text NOT NULL,
	"providerId" text NOT NULL,
	"providerLoadId" text NOT NULL,
	"sentAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "alertsOptInAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "AssistantUser" ADD COLUMN "alertsOptOutAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "AssistantAlert" ADD CONSTRAINT "AssistantAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AssistantUser"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AssistantAlertMatch" ADD CONSTRAINT "AssistantAlertMatch_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public"."AssistantAlert"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AssistantAlertMatch" ADD CONSTRAINT "AssistantAlertMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AssistantUser"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "AssistantAlert_active_lastCheckedAt_idx" ON "AssistantAlert" USING btree ("active","lastCheckedAt");--> statement-breakpoint
CREATE INDEX "AssistantAlert_userId_idx" ON "AssistantAlert" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "AssistantAlertMatch_alert_load_key" ON "AssistantAlertMatch" USING btree ("alertId","providerId","providerLoadId");--> statement-breakpoint
CREATE INDEX "AssistantAlertMatch_userId_sentAt_idx" ON "AssistantAlertMatch" USING btree ("userId","sentAt");