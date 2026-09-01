-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('BOX_TRUCK', 'DRY_VAN', 'REEFER', 'FLATBED', 'POWER_ONLY', 'SPRINTER_VAN', 'OTHER');

-- CreateEnum
CREATE TYPE "LoadCapacity" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ExpenseBehavior" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "ExpenseScope" AS ENUM ('TRUCK', 'BUSINESS');

-- CreateEnum
CREATE TYPE "FinancialTreatment" AS ENUM ('OPERATING', 'INTEREST', 'PRINCIPAL', 'DEBT_UNALLOCATED');

-- CreateEnum
CREATE TYPE "FinancialObligationKind" AS ENUM ('LOAN', 'OPERATING_LEASE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RATE_CONFIRMATION', 'BOL', 'POD', 'INVOICE', 'RECEIPT', 'REGISTRATION', 'INSURANCE', 'TITLE', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('OIL_CHANGE', 'OIL_FILTER', 'FUEL_FILTER', 'TIRES', 'BRAKES', 'TRANSMISSION', 'COOLANT', 'BATTERY', 'DOT_INSPECTION', 'STATE_INSPECTION', 'REGISTRATION', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceBasis" AS ENUM ('DATE', 'MILEAGE', 'BOTH');

-- CreateEnum
CREATE TYPE "ReserveKind" AS ENUM ('TAX', 'MAINTENANCE', 'EMERGENCY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReserveBasis" AS ENUM ('OPERATING_PROFIT', 'GROSS_REVENUE');

-- CreateEnum
CREATE TYPE "ReserveTransactionType" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SettlementHalf" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "DriverPayType" AS ENUM ('PERCENT_GROSS', 'PER_LOADED_MILE', 'PER_TOTAL_MILE', 'FLAT_PER_LOAD');

-- CreateEnum
CREATE TYPE "DriverSettlementStatus" AS ENUM ('DRAFT', 'PAID');

-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('INDIVIDUAL', 'SOLO', 'OWNER', 'FLEET');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FUEL', 'TOLLS', 'INSURANCE', 'TRUCK_PAYMENT', 'INTEREST_EXPENSE', 'PRINCIPAL_PAYMENT', 'OPERATING_LEASE', 'MAINTENANCE', 'REPAIRS', 'PARKING', 'DISPATCH', 'FACTORING', 'ELD', 'PERMITS', 'REGISTRATION', 'OFFICE', 'PHONE', 'ACCOUNTING', 'DRIVER_PAY', 'OTHER');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'BOOKKEEPER', 'DISPATCHER', 'VIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OWNER',
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialGoal" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "monthlyRevenueTarget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monthlyProfitTarget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "targetProfitPerMile" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
    "maxDeadheadPct" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "targetLoads" INTEGER,
    "workingDaysPerWeek" INTEGER NOT NULL DEFAULT 6,
    "expectedMonthlyMiles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" "PlanId" NOT NULL DEFAULT 'OWNER',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodEnd" TIMESTAMP(3),
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "ReserveKind" NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "ReserveBasis" NOT NULL DEFAULT 'GROSS_REVENUE',
    "contributionPct" DECIMAL(5,2),
    "targetBalance" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReserveAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveTransaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ReserveTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "half" "SettlementHalf" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSettings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "taxReservePct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "maintenanceReservePct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "categoryBehavior" JSONB NOT NULL DEFAULT '{}',
    "ratingGreatPerMile" DECIMAL(8,2) NOT NULL DEFAULT 2,
    "ratingGoodPerMile" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
    "ratingMarginalPerMile" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "deadheadWarnPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "maintenanceWarnMiles" INTEGER NOT NULL DEFAULT 2000,
    "maintenanceWarnDays" INTEGER NOT NULL DEFAULT 30,
    "iftaTaxRates" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "vin" TEXT,
    "purchasePrice" DECIMAL(12,2),
    "monthlyPayment" DECIMAL(12,2),
    "monthlyInsurance" DECIMAL(12,2),
    "axleCount" INTEGER,
    "registeredGrossWeightLbs" INTEGER,
    "operatesInMultipleIftaJurisdictions" BOOLEAN,
    "startingOdometer" INTEGER NOT NULL DEFAULT 0,
    "currentOdometer" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "acquiredOn" DATE,
    "soldOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Load" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "driverId" TEXT,
    "date" DATE NOT NULL,
    "deliveryDate" DATE,
    "endingOdometer" INTEGER,
    "originCity" TEXT NOT NULL,
    "originState" VARCHAR(2) NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "destinationState" VARCHAR(2) NOT NULL,
    "broker" TEXT,
    "loadNumber" TEXT,
    "equipmentType" "EquipmentType",
    "loadCapacity" "LoadCapacity",
    "equipmentLengthFt" INTEGER,
    "weightLbs" INTEGER,
    "commodity" TEXT,
    "loadedMiles" INTEGER NOT NULL,
    "deadheadMiles" INTEGER NOT NULL DEFAULT 0,
    "grossRate" DECIMAL(12,2) NOT NULL,
    "fuelCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tolls" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dispatchFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "factoringFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "driverPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costsPosted" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "jurisdictionMiles" JSONB NOT NULL DEFAULT '[]',
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "invoiceDueDate" DATE,
    "invoicePaidDate" DATE,
    "billToName" TEXT,
    "billToEmail" TEXT,
    "billToAddress" TEXT,
    "invoiceNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Load_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "truckId" TEXT,
    "loadId" TEXT,
    "date" DATE NOT NULL,
    "scope" "ExpenseScope" NOT NULL DEFAULT 'TRUCK',
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "financialTreatment" "FinancialTreatment",
    "obligationId" TEXT,
    "splitGroupId" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "receiptNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialObligation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "truckId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "FinancialObligationKind" NOT NULL,
    "counterparty" TEXT,
    "startedOn" DATE,
    "endedOn" DATE,
    "expectedMonthlyPayment" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "defaultTruckId" TEXT,
    "payType" "DriverPayType" NOT NULL,
    "payRate" DECIMAL(12,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverSettlement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "DriverSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "paidOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverSettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "grossRevenue" DECIMAL(12,2) NOT NULL,
    "loadedMiles" INTEGER NOT NULL,
    "totalMiles" INTEGER NOT NULL,
    "payType" "DriverPayType" NOT NULL,
    "payRate" DECIMAL(12,4) NOT NULL,
    "payAmount" DECIMAL(12,2) NOT NULL,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "loadId" TEXT,
    "date" DATE NOT NULL,
    "gallons" DECIMAL(10,3) NOT NULL,
    "pricePerGallon" DECIMAL(10,3) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "odometer" INTEGER,
    "location" TEXT,
    "jurisdiction" VARCHAR(2),
    "expenseId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "basis" "MaintenanceBasis" NOT NULL DEFAULT 'BOTH',
    "serviceDate" DATE NOT NULL,
    "odometer" INTEGER,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "nextServiceDate" DATE,
    "nextServiceOdometer" INTEGER,
    "expenseId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loadId" TEXT,
    "expenseId" TEXT,
    "truckId" TEXT,
    "maintenanceId" TEXT,
    "type" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_businessId_idx" ON "User"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialGoal_businessId_key" ON "FinancialGoal"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_businessId_key" ON "Subscription"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "ReserveAccount_businessId_idx" ON "ReserveAccount"("businessId");

-- CreateIndex
CREATE INDEX "ReserveTransaction_businessId_date_idx" ON "ReserveTransaction"("businessId", "date");

-- CreateIndex
CREATE INDEX "ReserveTransaction_accountId_idx" ON "ReserveTransaction"("accountId");

-- CreateIndex
CREATE INDEX "ReserveTransaction_settlementId_idx" ON "ReserveTransaction"("settlementId");

-- CreateIndex
CREATE INDEX "Settlement_businessId_periodStart_idx" ON "Settlement"("businessId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_businessId_month_half_key" ON "Settlement"("businessId", "month", "half");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSettings_businessId_key" ON "FinancialSettings"("businessId");

-- CreateIndex
CREATE INDEX "Truck_businessId_idx" ON "Truck"("businessId");

-- CreateIndex
CREATE INDEX "Load_businessId_date_idx" ON "Load"("businessId", "date");

-- CreateIndex
CREATE INDEX "Load_truckId_date_idx" ON "Load"("truckId", "date");

-- CreateIndex
CREATE INDEX "Load_driverId_date_idx" ON "Load"("driverId", "date");

-- CreateIndex
CREATE INDEX "Load_status_idx" ON "Load"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Load_businessId_invoiceNumber_key" ON "Load"("businessId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Expense_businessId_date_idx" ON "Expense"("businessId", "date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_loadId_idx" ON "Expense"("loadId");

-- CreateIndex
CREATE INDEX "Expense_truckId_date_idx" ON "Expense"("truckId", "date");

-- CreateIndex
CREATE INDEX "Expense_obligationId_idx" ON "Expense"("obligationId");

-- CreateIndex
CREATE INDEX "FinancialObligation_businessId_active_idx" ON "FinancialObligation"("businessId", "active");

-- CreateIndex
CREATE INDEX "FinancialObligation_truckId_idx" ON "FinancialObligation"("truckId");

-- CreateIndex
CREATE INDEX "PaymentEvent_businessId_date_idx" ON "PaymentEvent"("businessId", "date");

-- CreateIndex
CREATE INDEX "PaymentEvent_loadId_date_idx" ON "PaymentEvent"("loadId", "date");

-- CreateIndex
CREATE INDEX "Driver_businessId_active_idx" ON "Driver"("businessId", "active");

-- CreateIndex
CREATE INDEX "Driver_defaultTruckId_idx" ON "Driver"("defaultTruckId");

-- CreateIndex
CREATE INDEX "DriverSettlement_businessId_periodStart_idx" ON "DriverSettlement"("businessId", "periodStart");

-- CreateIndex
CREATE INDEX "DriverSettlement_driverId_periodStart_idx" ON "DriverSettlement"("driverId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "DriverSettlementLine_loadId_key" ON "DriverSettlementLine"("loadId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverSettlementLine_expenseId_key" ON "DriverSettlementLine"("expenseId");

-- CreateIndex
CREATE INDEX "DriverSettlementLine_settlementId_idx" ON "DriverSettlementLine"("settlementId");

-- CreateIndex
CREATE INDEX "DriverSettlementLine_truckId_idx" ON "DriverSettlementLine"("truckId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelEntry_expenseId_key" ON "FuelEntry"("expenseId");

-- CreateIndex
CREATE INDEX "FuelEntry_businessId_date_idx" ON "FuelEntry"("businessId", "date");

-- CreateIndex
CREATE INDEX "FuelEntry_truckId_odometer_idx" ON "FuelEntry"("truckId", "odometer");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRecord_expenseId_key" ON "MaintenanceRecord"("expenseId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_businessId_serviceDate_idx" ON "MaintenanceRecord"("businessId", "serviceDate");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_truckId_type_idx" ON "MaintenanceRecord"("truckId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_businessId_idx" ON "Document"("businessId");

-- CreateIndex
CREATE INDEX "Document_loadId_idx" ON "Document"("loadId");

-- CreateIndex
CREATE INDEX "Document_expenseId_idx" ON "Document"("expenseId");

-- CreateIndex
CREATE INDEX "Document_truckId_idx" ON "Document"("truckId");

-- CreateIndex
CREATE INDEX "Document_maintenanceId_idx" ON "Document"("maintenanceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveAccount" ADD CONSTRAINT "ReserveAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReserveAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettings" ADD CONSTRAINT "FinancialSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "FinancialObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialObligation" ADD CONSTRAINT "FinancialObligation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialObligation" ADD CONSTRAINT "FinancialObligation_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_defaultTruckId_fkey" FOREIGN KEY ("defaultTruckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "DriverSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "MaintenanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
