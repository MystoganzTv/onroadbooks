CREATE TABLE "AppleBillingAccount" (
	"businessId" text PRIMARY KEY NOT NULL,
	"appAccountToken" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ApplePurchase" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"transactionId" text NOT NULL,
	"productId" text NOT NULL,
	"checkedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AppleBillingAccount" ADD CONSTRAINT "AppleBillingAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ApplePurchase" ADD CONSTRAINT "ApplePurchase_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "AppleBillingAccount_token_key" ON "AppleBillingAccount" USING btree ("appAccountToken");