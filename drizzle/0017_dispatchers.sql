CREATE TABLE "Dispatcher" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"name" text NOT NULL,
	"nameKey" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Dispatcher" ADD CONSTRAINT "Dispatcher_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Dispatcher_businessId_nameKey_key" ON "Dispatcher" USING btree ("businessId","nameKey");