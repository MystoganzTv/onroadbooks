ALTER TABLE "Expense" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."ExpenseCategory";--> statement-breakpoint
CREATE TYPE "public"."ExpenseCategory" AS ENUM('FUEL', 'TOLLS', 'INSURANCE', 'TRUCK_PAYMENT', 'MAINTENANCE', 'REPAIRS', 'PARKING', 'DISPATCH', 'FACTORING', 'ELD', 'PERMITS', 'REGISTRATION', 'OFFICE', 'PHONE', 'ACCOUNTING', 'OTHER', 'DRIVER_PAY', 'INTEREST_EXPENSE', 'PRINCIPAL_PAYMENT', 'OPERATING_LEASE');--> statement-breakpoint
ALTER TABLE "Expense" ALTER COLUMN "category" SET DATA TYPE "public"."ExpenseCategory" USING "category"::"public"."ExpenseCategory";--> statement-breakpoint
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'OWNER'::text;--> statement-breakpoint
DROP TYPE "public"."PlanId";--> statement-breakpoint
CREATE TYPE "public"."PlanId" AS ENUM('INDIVIDUAL', 'FLEET', 'SOLO', 'OWNER');--> statement-breakpoint
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'OWNER'::"public"."PlanId";--> statement-breakpoint
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DATA TYPE "public"."PlanId" USING "plan"::"public"."PlanId";