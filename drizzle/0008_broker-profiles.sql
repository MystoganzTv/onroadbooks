CREATE TABLE "Broker" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"name" text NOT NULL,
	"nameKey" text NOT NULL,
	"contactName" text,
	"phone" text,
	"email" text,
	"mcNumber" text,
	"address" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Broker_businessId_nameKey_key" ON "Broker" USING btree ("businessId","nameKey");