CREATE TYPE "public"."DocumentType" AS ENUM('RATE_CONFIRMATION', 'BOL', 'POD', 'INVOICE', 'RECEIPT', 'REGISTRATION', 'INSURANCE', 'TITLE', 'INSPECTION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."DriverPayType" AS ENUM('PERCENT_GROSS', 'PER_LOADED_MILE', 'PER_TOTAL_MILE', 'FLAT_PER_LOAD');--> statement-breakpoint
CREATE TYPE "public"."DriverSettlementAdjustmentType" AS ENUM('ACCESSORIAL_PAY', 'REIMBURSEMENT', 'DEDUCTION', 'ADVANCE', 'OTHER_EARNING');--> statement-breakpoint
CREATE TYPE "public"."DriverSettlementStatus" AS ENUM('DRAFT', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."EquipmentType" AS ENUM('BOX_TRUCK', 'DRY_VAN', 'REEFER', 'FLATBED', 'POWER_ONLY', 'SPRINTER_VAN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."ExpenseBehavior" AS ENUM('FIXED', 'VARIABLE');--> statement-breakpoint
CREATE TYPE "public"."ExpenseCategory" AS ENUM('FUEL', 'TOLLS', 'INSURANCE', 'TRUCK_PAYMENT', 'INTEREST_EXPENSE', 'PRINCIPAL_PAYMENT', 'OPERATING_LEASE', 'MAINTENANCE', 'REPAIRS', 'PARKING', 'DISPATCH', 'FACTORING', 'ELD', 'PERMITS', 'REGISTRATION', 'OFFICE', 'PHONE', 'ACCOUNTING', 'DRIVER_PAY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."ExpenseScope" AS ENUM('TRUCK', 'BUSINESS');--> statement-breakpoint
CREATE TYPE "public"."FinancialObligationKind" AS ENUM('LOAN', 'OPERATING_LEASE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."FinancialTreatment" AS ENUM('OPERATING', 'INTEREST', 'PRINCIPAL', 'DEBT_UNALLOCATED');--> statement-breakpoint
CREATE TYPE "public"."LoadCapacity" AS ENUM('FULL', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."MaintenanceBasis" AS ENUM('DATE', 'MILEAGE', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."MaintenanceType" AS ENUM('OIL_CHANGE', 'OIL_FILTER', 'FUEL_FILTER', 'TIRES', 'BRAKES', 'TRANSMISSION', 'COOLANT', 'BATTERY', 'DOT_INSPECTION', 'STATE_INSPECTION', 'REGISTRATION', 'INSURANCE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."MemberRole" AS ENUM('OWNER', 'ADMIN', 'BOOKKEEPER', 'DISPATCHER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."PaymentStatus" AS ENUM('PENDING', 'INVOICED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."PlanId" AS ENUM('INDIVIDUAL', 'SOLO', 'OWNER', 'FLEET');--> statement-breakpoint
CREATE TYPE "public"."ReserveBasis" AS ENUM('OPERATING_PROFIT', 'GROSS_REVENUE');--> statement-breakpoint
CREATE TYPE "public"."ReserveKind" AS ENUM('TAX', 'MAINTENANCE', 'EMERGENCY', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."ReserveTransactionType" AS ENUM('CONTRIBUTION', 'WITHDRAWAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."SettlementHalf" AS ENUM('FIRST', 'SECOND');--> statement-breakpoint
CREATE TYPE "public"."SettlementStatus" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionStatus" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"passwordHash" text NOT NULL,
	"role" "MemberRole" DEFAULT 'OWNER' NOT NULL,
	"invitedAt" timestamp (3),
	"joinedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP,
	"businessId" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Business" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FinancialGoal" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"monthlyRevenueTarget" numeric(12, 2) DEFAULT 0 NOT NULL,
	"monthlyProfitTarget" numeric(12, 2) DEFAULT 0 NOT NULL,
	"targetProfitPerMile" numeric(8, 2) DEFAULT 1.5 NOT NULL,
	"maxDeadheadPct" numeric(5, 2) DEFAULT 15 NOT NULL,
	"targetLoads" integer,
	"workingDaysPerWeek" integer DEFAULT 6 NOT NULL,
	"expectedMonthlyMiles" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"plan" "PlanId" DEFAULT 'OWNER' NOT NULL,
	"status" "SubscriptionStatus" DEFAULT 'TRIALING' NOT NULL,
	"currentPeriodEnd" timestamp (3),
	"providerCustomerId" text,
	"providerSubscriptionId" text,
	"startedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ReserveAccount" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"kind" "ReserveKind" NOT NULL,
	"name" text NOT NULL,
	"basis" "ReserveBasis" DEFAULT 'GROSS_REVENUE' NOT NULL,
	"contributionPct" numeric(5, 2),
	"targetBalance" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ReserveTransaction" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"accountId" text NOT NULL,
	"date" date NOT NULL,
	"type" "ReserveTransactionType" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"settlementId" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Settlement" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"month" varchar(7) NOT NULL,
	"half" "SettlementHalf" NOT NULL,
	"periodStart" date NOT NULL,
	"periodEnd" date NOT NULL,
	"status" "SettlementStatus" DEFAULT 'OPEN' NOT NULL,
	"closedAt" timestamp (3),
	"snapshot" jsonb,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FinancialSettings" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"taxReservePct" numeric(5, 2) DEFAULT 20 NOT NULL,
	"maintenanceReservePct" numeric(5, 2) DEFAULT 5 NOT NULL,
	"categoryBehavior" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fleetOverheadAllocation" text DEFAULT 'UNALLOCATED' NOT NULL,
	"ratingGreatPerMile" numeric(8, 2) DEFAULT 2 NOT NULL,
	"ratingGoodPerMile" numeric(8, 2) DEFAULT 1.5 NOT NULL,
	"ratingMarginalPerMile" numeric(8, 2) DEFAULT 1 NOT NULL,
	"deadheadWarnPct" numeric(5, 2) DEFAULT 20 NOT NULL,
	"maintenanceWarnMiles" integer DEFAULT 2000 NOT NULL,
	"maintenanceWarnDays" integer DEFAULT 30 NOT NULL,
	"iftaTaxRates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "FinancialSettings_fleetOverheadAllocation_check" CHECK ("FinancialSettings"."fleetOverheadAllocation" IN ('UNALLOCATED', 'FLEET_MILES'))
);
--> statement-breakpoint
CREATE TABLE "Truck" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"make" text,
	"model" text,
	"vin" text,
	"purchasePrice" numeric(12, 2),
	"monthlyPayment" numeric(12, 2),
	"monthlyInsurance" numeric(12, 2),
	"financingConfirmedNone" boolean,
	"operatingCostExemptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"axleCount" integer,
	"registeredGrossWeightLbs" integer,
	"operatesInMultipleIftaJurisdictions" boolean,
	"iftaReportingEnabled" boolean,
	"startingOdometer" integer DEFAULT 0 NOT NULL,
	"currentOdometer" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"acquiredOn" date,
	"soldOn" date,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Load" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"truckId" text NOT NULL,
	"driverId" text,
	"date" date NOT NULL,
	"deliveryDate" date,
	"endingOdometer" integer,
	"originCity" text NOT NULL,
	"originState" varchar(2) NOT NULL,
	"destinationCity" text NOT NULL,
	"destinationState" varchar(2) NOT NULL,
	"broker" text,
	"loadNumber" text,
	"equipmentType" "EquipmentType",
	"loadCapacity" "LoadCapacity",
	"equipmentLengthFt" integer,
	"weightLbs" integer,
	"commodity" text,
	"loadedMiles" integer NOT NULL,
	"deadheadMiles" integer DEFAULT 0 NOT NULL,
	"grossRate" numeric(12, 2) NOT NULL,
	"fuelCost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"tolls" numeric(12, 2) DEFAULT 0 NOT NULL,
	"dispatchFee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"factoringFee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"otherExpenses" numeric(12, 2) DEFAULT 0 NOT NULL,
	"driverPay" numeric(12, 2) DEFAULT 0 NOT NULL,
	"costsPosted" boolean DEFAULT false NOT NULL,
	"status" "PaymentStatus" DEFAULT 'PENDING' NOT NULL,
	"jurisdictionMiles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invoiceNumber" text,
	"invoiceDate" date,
	"invoiceDueDate" date,
	"invoicePaidDate" date,
	"billToName" text,
	"billToEmail" text,
	"billToAddress" text,
	"invoiceNotes" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Expense" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"truckId" text,
	"loadId" text,
	"date" date NOT NULL,
	"scope" "ExpenseScope" DEFAULT 'TRUCK' NOT NULL,
	"category" "ExpenseCategory" NOT NULL,
	"description" text NOT NULL,
	"vendor" text,
	"amount" numeric(12, 2) NOT NULL,
	"financialTreatment" "FinancialTreatment",
	"obligationId" text,
	"splitGroupId" text,
	"recurring" boolean DEFAULT false NOT NULL,
	"receiptNumber" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FinancialObligation" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"truckId" text,
	"name" text NOT NULL,
	"kind" "FinancialObligationKind" NOT NULL,
	"counterparty" text,
	"startedOn" date,
	"endedOn" date,
	"startingBalance" numeric(12, 2),
	"aprPercent" numeric(5, 2),
	"paymentDueDay" integer,
	"expectedMonthlyPayment" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PaymentEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"loadId" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" text,
	"reference" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Driver" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"name" text NOT NULL,
	"reference" text,
	"defaultTruckId" text,
	"payType" "DriverPayType" NOT NULL,
	"payRate" numeric(12, 4) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DriverSettlement" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"driverId" text NOT NULL,
	"periodStart" date NOT NULL,
	"periodEnd" date NOT NULL,
	"status" "DriverSettlementStatus" DEFAULT 'DRAFT' NOT NULL,
	"paidOn" date,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DriverSettlementAdjustment" (
	"id" text PRIMARY KEY NOT NULL,
	"settlementId" text NOT NULL,
	"type" "DriverSettlementAdjustmentType" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "DriverSettlementAdjustment_amount_positive" CHECK ("DriverSettlementAdjustment"."amount" > 0),
	CONSTRAINT "DriverSettlementAdjustment_reason_present" CHECK (char_length(trim("DriverSettlementAdjustment"."reason")) >= 2)
);
--> statement-breakpoint
CREATE TABLE "DriverSettlementLine" (
	"id" text PRIMARY KEY NOT NULL,
	"settlementId" text NOT NULL,
	"loadId" text NOT NULL,
	"truckId" text NOT NULL,
	"grossRevenue" numeric(12, 2) NOT NULL,
	"loadedMiles" integer NOT NULL,
	"totalMiles" integer NOT NULL,
	"payType" "DriverPayType" NOT NULL,
	"payRate" numeric(12, 4) NOT NULL,
	"payAmount" numeric(12, 2) NOT NULL,
	"expenseId" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FuelEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"truckId" text NOT NULL,
	"loadId" text,
	"date" date NOT NULL,
	"gallons" numeric(10, 3) NOT NULL,
	"pricePerGallon" numeric(10, 3) NOT NULL,
	"totalCost" numeric(12, 2) NOT NULL,
	"odometer" integer,
	"location" text,
	"jurisdiction" varchar(2),
	"expenseId" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MaintenanceRecord" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"truckId" text NOT NULL,
	"type" "MaintenanceType" NOT NULL,
	"basis" "MaintenanceBasis" DEFAULT 'BOTH' NOT NULL,
	"serviceDate" date NOT NULL,
	"odometer" integer,
	"cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"vendor" text,
	"nextServiceDate" date,
	"nextServiceOdometer" integer,
	"expenseId" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Document" (
	"id" text PRIMARY KEY NOT NULL,
	"businessId" text NOT NULL,
	"loadId" text,
	"expenseId" text,
	"truckId" text,
	"maintenanceId" text,
	"type" "DocumentType" DEFAULT 'OTHER' NOT NULL,
	"label" text NOT NULL,
	"fileName" text NOT NULL,
	"contentType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"storageKey" text NOT NULL,
	"uploadedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ReserveAccount" ADD CONSTRAINT "ReserveAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."ReserveAccount"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "public"."Settlement"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FinancialSettings" ADD CONSTRAINT "FinancialSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Load" ADD CONSTRAINT "Load_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Load" ADD CONSTRAINT "Load_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."Truck"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Load" ADD CONSTRAINT "Load_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."Truck"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."Load"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "public"."FinancialObligation"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FinancialObligation" ADD CONSTRAINT "FinancialObligation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FinancialObligation" ADD CONSTRAINT "FinancialObligation_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."Truck"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."Load"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_defaultTruckId_fkey" FOREIGN KEY ("defaultTruckId") REFERENCES "public"."Truck"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DriverSettlementAdjustment" ADD CONSTRAINT "DriverSettlementAdjustment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "public"."DriverSettlement"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "public"."DriverSettlement"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."Load"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."Truck"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."Expense"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."Truck"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."Load"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."Expense"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."Truck"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."Expense"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."Load"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."Expense"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."Truck"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "public"."MaintenanceRecord"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_key" ON "User" USING btree ("email");--> statement-breakpoint
CREATE INDEX "User_businessId_idx" ON "User" USING btree ("businessId");--> statement-breakpoint
CREATE UNIQUE INDEX "FinancialGoal_businessId_key" ON "FinancialGoal" USING btree ("businessId");--> statement-breakpoint
CREATE UNIQUE INDEX "Subscription_businessId_key" ON "Subscription" USING btree ("businessId");--> statement-breakpoint
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription" USING btree ("providerSubscriptionId");--> statement-breakpoint
CREATE INDEX "ReserveAccount_businessId_idx" ON "ReserveAccount" USING btree ("businessId");--> statement-breakpoint
CREATE INDEX "ReserveTransaction_businessId_date_idx" ON "ReserveTransaction" USING btree ("businessId","date");--> statement-breakpoint
CREATE INDEX "ReserveTransaction_accountId_idx" ON "ReserveTransaction" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "ReserveTransaction_settlementId_idx" ON "ReserveTransaction" USING btree ("settlementId");--> statement-breakpoint
CREATE INDEX "Settlement_businessId_periodStart_idx" ON "Settlement" USING btree ("businessId","periodStart");--> statement-breakpoint
CREATE UNIQUE INDEX "Settlement_businessId_month_half_key" ON "Settlement" USING btree ("businessId","month","half");--> statement-breakpoint
CREATE UNIQUE INDEX "FinancialSettings_businessId_key" ON "FinancialSettings" USING btree ("businessId");--> statement-breakpoint
CREATE INDEX "Truck_businessId_idx" ON "Truck" USING btree ("businessId");--> statement-breakpoint
CREATE INDEX "Load_businessId_date_idx" ON "Load" USING btree ("businessId","date");--> statement-breakpoint
CREATE INDEX "Load_truckId_date_idx" ON "Load" USING btree ("truckId","date");--> statement-breakpoint
CREATE INDEX "Load_driverId_date_idx" ON "Load" USING btree ("driverId","date");--> statement-breakpoint
CREATE INDEX "Load_status_idx" ON "Load" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "Load_businessId_invoiceNumber_key" ON "Load" USING btree ("businessId","invoiceNumber");--> statement-breakpoint
CREATE INDEX "Expense_businessId_date_idx" ON "Expense" USING btree ("businessId","date");--> statement-breakpoint
CREATE INDEX "Expense_category_idx" ON "Expense" USING btree ("category");--> statement-breakpoint
CREATE INDEX "Expense_loadId_idx" ON "Expense" USING btree ("loadId");--> statement-breakpoint
CREATE INDEX "Expense_truckId_date_idx" ON "Expense" USING btree ("truckId","date");--> statement-breakpoint
CREATE INDEX "Expense_obligationId_idx" ON "Expense" USING btree ("obligationId");--> statement-breakpoint
CREATE INDEX "FinancialObligation_businessId_active_idx" ON "FinancialObligation" USING btree ("businessId","active");--> statement-breakpoint
CREATE INDEX "FinancialObligation_truckId_idx" ON "FinancialObligation" USING btree ("truckId");--> statement-breakpoint
CREATE INDEX "PaymentEvent_businessId_date_idx" ON "PaymentEvent" USING btree ("businessId","date");--> statement-breakpoint
CREATE INDEX "PaymentEvent_loadId_date_idx" ON "PaymentEvent" USING btree ("loadId","date");--> statement-breakpoint
CREATE INDEX "Driver_businessId_active_idx" ON "Driver" USING btree ("businessId","active");--> statement-breakpoint
CREATE INDEX "Driver_defaultTruckId_idx" ON "Driver" USING btree ("defaultTruckId");--> statement-breakpoint
CREATE INDEX "DriverSettlement_businessId_periodStart_idx" ON "DriverSettlement" USING btree ("businessId","periodStart");--> statement-breakpoint
CREATE INDEX "DriverSettlement_driverId_periodStart_idx" ON "DriverSettlement" USING btree ("driverId","periodStart");--> statement-breakpoint
CREATE INDEX "DriverSettlementAdjustment_settlementId_createdAt_idx" ON "DriverSettlementAdjustment" USING btree ("settlementId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "DriverSettlementLine_loadId_key" ON "DriverSettlementLine" USING btree ("loadId");--> statement-breakpoint
CREATE UNIQUE INDEX "DriverSettlementLine_expenseId_key" ON "DriverSettlementLine" USING btree ("expenseId");--> statement-breakpoint
CREATE INDEX "DriverSettlementLine_settlementId_idx" ON "DriverSettlementLine" USING btree ("settlementId");--> statement-breakpoint
CREATE INDEX "DriverSettlementLine_truckId_idx" ON "DriverSettlementLine" USING btree ("truckId");--> statement-breakpoint
CREATE UNIQUE INDEX "FuelEntry_expenseId_key" ON "FuelEntry" USING btree ("expenseId");--> statement-breakpoint
CREATE INDEX "FuelEntry_businessId_date_idx" ON "FuelEntry" USING btree ("businessId","date");--> statement-breakpoint
CREATE INDEX "FuelEntry_truckId_odometer_idx" ON "FuelEntry" USING btree ("truckId","odometer");--> statement-breakpoint
CREATE UNIQUE INDEX "MaintenanceRecord_expenseId_key" ON "MaintenanceRecord" USING btree ("expenseId");--> statement-breakpoint
CREATE INDEX "MaintenanceRecord_businessId_serviceDate_idx" ON "MaintenanceRecord" USING btree ("businessId","serviceDate");--> statement-breakpoint
CREATE INDEX "MaintenanceRecord_truckId_type_idx" ON "MaintenanceRecord" USING btree ("truckId","type");--> statement-breakpoint
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document" USING btree ("storageKey");--> statement-breakpoint
CREATE INDEX "Document_businessId_idx" ON "Document" USING btree ("businessId");--> statement-breakpoint
CREATE INDEX "Document_loadId_idx" ON "Document" USING btree ("loadId");--> statement-breakpoint
CREATE INDEX "Document_expenseId_idx" ON "Document" USING btree ("expenseId");--> statement-breakpoint
CREATE INDEX "Document_truckId_idx" ON "Document" USING btree ("truckId");--> statement-breakpoint
CREATE INDEX "Document_maintenanceId_idx" ON "Document" USING btree ("maintenanceId");