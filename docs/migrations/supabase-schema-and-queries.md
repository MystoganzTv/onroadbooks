# OnRoadBooks — anexo de schema y consultas

Fecha: 2026-09-19. Inventario estático de `prisma/schema.prisma` y las siete migraciones versionadas. **No es una introspección de producción.** Complementa [la auditoría](supabase-audit-and-migration-plan.md).

## Schema completo declarado

Se conservan nombres originales y atributos Prisma. Las relaciones de objeto no son columnas adicionales. `cuid()` y `@updatedAt` son comportamientos del ORM, no defaults/triggers SQL. Los CHECK SQL aparecen más abajo.

### User

```prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  name         String?
  passwordHash String
  role         MemberRole @default(OWNER)
  invitedAt    DateTime?
  joinedAt     DateTime?  @default(now())
  businessId   String?
  business     Business?  @relation(fields: [businessId], references: [id], onDelete: SetNull)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  @@index([businessId])
}
```

### Business

```prisma
model Business {
  id        String   @id @default(cuid())
  name      String
  currency  String   @default("USD")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users                User[]
  trucks               Truck[]
  loads                Load[]
  expenses             Expense[]
  financialObligations FinancialObligation[]
  paymentEvents        PaymentEvent[]
  fuelEntries          FuelEntry[]
  documents            Document[]
  maintenance          MaintenanceRecord[]
  settings             FinancialSettings?
  goals                FinancialGoal?
  subscription         Subscription?
  reserveAccounts      ReserveAccount[]
  reserveTransactions  ReserveTransaction[]
  settlements          Settlement[]
  drivers              Driver[]
  driverSettlements    DriverSettlement[]
}
```

### FinancialGoal

```prisma
model FinancialGoal {
  id         String   @id @default(cuid())
  businessId String   @unique
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  monthlyRevenueTarget Decimal @default(0) @db.Decimal(12, 2)
  monthlyProfitTarget  Decimal @default(0) @db.Decimal(12, 2)
  targetProfitPerMile  Decimal @default(1.5) @db.Decimal(8, 2)
  maxDeadheadPct       Decimal @default(15) @db.Decimal(5, 2)
  targetLoads          Int?
  workingDaysPerWeek   Int     @default(6)
  expectedMonthlyMiles Int     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Subscription

```prisma
model Subscription {
  id         String   @id @default(cuid())
  businessId String   @unique
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  plan   PlanId             @default(OWNER)
  status SubscriptionStatus @default(TRIALING)
  currentPeriodEnd DateTime?
  providerCustomerId     String?
  providerSubscriptionId String? @unique
  startedAt DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### ReserveAccount

```prisma
model ReserveAccount {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  kind  ReserveKind
  name  String
  basis ReserveBasis @default(GROSS_REVENUE)
  contributionPct Decimal? @db.Decimal(5, 2)
  targetBalance   Decimal? @db.Decimal(12, 2)
  active          Boolean  @default(true)
  sortOrder       Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  transactions ReserveTransaction[]
  @@index([businessId])
}
```

### ReserveTransaction

```prisma
model ReserveTransaction {
  id         String         @id @default(cuid())
  businessId String
  business   Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  accountId  String
  account    ReserveAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  date        DateTime               @db.Date
  type        ReserveTransactionType
  amount      Decimal                @db.Decimal(12, 2)
  description String
  settlementId String?
  settlement   Settlement? @relation(fields: [settlementId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  @@index([businessId, date])
  @@index([accountId])
  @@index([settlementId])
}
```

### Settlement

```prisma
model Settlement {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  month String         @db.VarChar(7)
  half  SettlementHalf
  periodStart DateTime @db.Date
  periodEnd   DateTime @db.Date
  status   SettlementStatus @default(OPEN)
  closedAt DateTime?
  snapshot Json?
  notes    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  reserveTransactions ReserveTransaction[]
  @@unique([businessId, month, half])
  @@index([businessId, periodStart])
}
```

### FinancialSettings

```prisma
model FinancialSettings {
  id         String   @id @default(cuid())
  businessId String   @unique
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  taxReservePct         Decimal @default(20) @db.Decimal(5, 2)
  maintenanceReservePct Decimal @default(5) @db.Decimal(5, 2)
  categoryBehavior      Json    @default("{}")
  fleetOverheadAllocation String @default("UNALLOCATED")
  ratingGreatPerMile    Decimal @default(2) @db.Decimal(8, 2)
  ratingGoodPerMile     Decimal @default(1.5) @db.Decimal(8, 2)
  ratingMarginalPerMile Decimal @default(1) @db.Decimal(8, 2)
  deadheadWarnPct      Decimal @default(20) @db.Decimal(5, 2)
  maintenanceWarnMiles Int     @default(2000)
  maintenanceWarnDays  Int     @default(30)
  iftaTaxRates         Json    @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Truck

```prisma
model Truck {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  name                                String
  year                                Int?
  make                                String?
  model                               String?
  vin                                 String?
  purchasePrice                       Decimal? @db.Decimal(12, 2)
  monthlyPayment                      Decimal? @db.Decimal(12, 2)
  monthlyInsurance                    Decimal? @db.Decimal(12, 2)
  financingConfirmedNone              Boolean?
  operatingCostExemptions             Json     @default("{}")
  axleCount                           Int?
  registeredGrossWeightLbs            Int?
  operatesInMultipleIftaJurisdictions Boolean?
  iftaReportingEnabled                Boolean?
  startingOdometer                    Int      @default(0)
  currentOdometer                     Int      @default(0)
  active                              Boolean  @default(true)
  acquiredOn DateTime? @db.Date
  soldOn     DateTime? @db.Date
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  loads                 Load[]
  expenses              Expense[]
  financialObligations  FinancialObligation[]
  fuelEntries           FuelEntry[]
  documents             Document[]
  maintenance           MaintenanceRecord[]
  defaultDrivers        Driver[]               @relation("DriverDefaultTruck")
  driverSettlementLines DriverSettlementLine[]
  @@index([businessId])
}
```

### Load

```prisma
model Load {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  truckId    String
  truck      Truck    @relation(fields: [truckId], references: [id], onDelete: Cascade)
  driverId   String?
  driver     Driver?  @relation(fields: [driverId], references: [id], onDelete: SetNull)
  date             DateTime  @db.Date
  deliveryDate     DateTime? @db.Date
  endingOdometer   Int?
  originCity       String
  originState      String    @db.VarChar(2)
  destinationCity  String
  destinationState String    @db.VarChar(2)
  broker           String?
  loadNumber       String?
  equipmentType     EquipmentType?
  loadCapacity      LoadCapacity?
  equipmentLengthFt Int?
  weightLbs         Int?
  commodity         String?
  loadedMiles   Int
  deadheadMiles Int     @default(0)
  grossRate     Decimal @db.Decimal(12, 2)
  fuelCost      Decimal @default(0) @db.Decimal(12, 2)
  tolls         Decimal @default(0) @db.Decimal(12, 2)
  dispatchFee   Decimal @default(0) @db.Decimal(12, 2)
  factoringFee  Decimal @default(0) @db.Decimal(12, 2)
  otherExpenses Decimal @default(0) @db.Decimal(12, 2)
  driverPay     Decimal @default(0) @db.Decimal(12, 2)
  costsPosted   Boolean @default(false)
  status            PaymentStatus @default(PENDING)
  jurisdictionMiles Json          @default("[]")
  invoiceNumber   String?
  invoiceDate     DateTime? @db.Date
  invoiceDueDate  DateTime? @db.Date
  invoicePaidDate DateTime? @db.Date
  billToName      String?
  billToEmail     String?
  billToAddress   String?
  invoiceNotes    String?
  notes           String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  expenses             Expense[]
  fuelEntries          FuelEntry[]
  documents            Document[]
  driverSettlementLine DriverSettlementLine?
  paymentEvents        PaymentEvent[]
  @@unique([businessId, invoiceNumber])
  @@index([businessId, date])
  @@index([truckId, date])
  @@index([driverId, date])
  @@index([status])
}
```

### Expense

```prisma
model Expense {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  truckId    String?
  truck      Truck?   @relation(fields: [truckId], references: [id], onDelete: SetNull)
  loadId     String?
  load       Load?    @relation(fields: [loadId], references: [id], onDelete: SetNull)
  date               DateTime             @db.Date
  scope              ExpenseScope         @default(TRUCK)
  category           ExpenseCategory
  description        String
  vendor             String?
  amount             Decimal              @db.Decimal(12, 2)
  financialTreatment FinancialTreatment?
  obligationId       String?
  obligation         FinancialObligation? @relation(fields: [obligationId], references: [id], onDelete: SetNull)
  splitGroupId       String?
  recurring          Boolean              @default(false)
  receiptNumber      String?
  notes              String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  documents            Document[]
  maintenance          MaintenanceRecord[]
  fuelEntry            FuelEntry?            @relation("FuelEntryExpense")
  driverSettlementLine DriverSettlementLine? @relation("DriverSettlementExpense")
  @@index([businessId, date])
  @@index([category])
  @@index([loadId])
  @@index([truckId, date])
  @@index([obligationId])
}
```

### FinancialObligation

```prisma
model FinancialObligation {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  truckId    String?
  truck      Truck?   @relation(fields: [truckId], references: [id], onDelete: SetNull)
  name                   String
  kind                   FinancialObligationKind
  counterparty           String?
  startedOn              DateTime?               @db.Date
  endedOn                DateTime?               @db.Date
  startingBalance        Decimal?                @db.Decimal(12, 2)
  aprPercent             Decimal?                @db.Decimal(5, 2)
  paymentDueDay          Int?
  expectedMonthlyPayment Decimal?                @db.Decimal(12, 2)
  active                 Boolean                 @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  expenses Expense[]
  @@index([businessId, active])
  @@index([truckId])
}
```

### PaymentEvent

```prisma
model PaymentEvent {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  loadId     String
  load       Load     @relation(fields: [loadId], references: [id], onDelete: Restrict)
  date      DateTime @db.Date
  amount    Decimal  @db.Decimal(12, 2)
  method    String?
  reference String?
  notes     String?
  createdAt DateTime @default(now())
  @@index([businessId, date])
  @@index([loadId, date])
}
```

### Driver

```prisma
model Driver {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  name           String
  reference      String?
  defaultTruckId String?
  defaultTruck   Truck?        @relation("DriverDefaultTruck", fields: [defaultTruckId], references: [id], onDelete: SetNull)
  payType        DriverPayType
  payRate        Decimal       @db.Decimal(12, 4)
  active         Boolean       @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  loads       Load[]
  settlements DriverSettlement[]
  @@index([businessId, active])
  @@index([defaultTruckId])
}
```

### DriverSettlement

```prisma
model DriverSettlement {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  driverId   String
  driver     Driver   @relation(fields: [driverId], references: [id], onDelete: Restrict)
  periodStart DateTime               @db.Date
  periodEnd   DateTime               @db.Date
  status      DriverSettlementStatus @default(DRAFT)
  paidOn      DateTime?              @db.Date
  notes       String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  lines       DriverSettlementLine[]
  adjustments DriverSettlementAdjustment[]
  @@index([businessId, periodStart])
  @@index([driverId, periodStart])
}
```

### DriverSettlementAdjustment

```prisma
model DriverSettlementAdjustment {
  id           String           @id @default(cuid())
  settlementId String
  settlement   DriverSettlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)
  type   DriverSettlementAdjustmentType
  amount Decimal                        @db.Decimal(12, 2)
  reason String
  createdAt DateTime @default(now())
  @@index([settlementId, createdAt])
}
```

### DriverSettlementLine

```prisma
model DriverSettlementLine {
  id           String           @id @default(cuid())
  settlementId String
  settlement   DriverSettlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)
  loadId       String           @unique
  load         Load             @relation(fields: [loadId], references: [id], onDelete: Restrict)
  truckId      String
  truck        Truck            @relation(fields: [truckId], references: [id], onDelete: Restrict)
  grossRevenue Decimal       @db.Decimal(12, 2)
  loadedMiles  Int
  totalMiles   Int
  payType      DriverPayType
  payRate      Decimal       @db.Decimal(12, 4)
  payAmount    Decimal       @db.Decimal(12, 2)
  expenseId String?  @unique
  expense   Expense? @relation("DriverSettlementExpense", fields: [expenseId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  @@index([settlementId])
  @@index([truckId])
}
```

### FuelEntry

```prisma
model FuelEntry {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  truckId    String
  truck      Truck    @relation(fields: [truckId], references: [id], onDelete: Cascade)
  loadId     String?
  load       Load?    @relation(fields: [loadId], references: [id], onDelete: SetNull)
  date           DateTime @db.Date
  gallons        Decimal  @db.Decimal(10, 3)
  pricePerGallon Decimal  @db.Decimal(10, 3)
  totalCost      Decimal  @db.Decimal(12, 2)
  odometer       Int?
  location       String?
  jurisdiction   String?  @db.VarChar(2)
  expenseId String?  @unique
  expense   Expense? @relation("FuelEntryExpense", fields: [expenseId], references: [id], onDelete: SetNull)
  notes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([businessId, date])
  @@index([truckId, odometer])
}
```

### MaintenanceRecord

```prisma
model MaintenanceRecord {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  truckId    String
  truck      Truck    @relation(fields: [truckId], references: [id], onDelete: Cascade)
  type  MaintenanceType
  basis MaintenanceBasis @default(BOTH)
  serviceDate DateTime @db.Date
  odometer    Int?
  cost        Decimal  @default(0) @db.Decimal(12, 2)
  vendor      String?
  nextServiceDate     DateTime? @db.Date
  nextServiceOdometer Int?
  expenseId String?  @unique
  expense   Expense? @relation(fields: [expenseId], references: [id], onDelete: SetNull)
  notes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  documents Document[]
  @@index([businessId, serviceDate])
  @@index([truckId, type])
}
```

### Document

```prisma
model Document {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  loadId        String?
  load          Load?              @relation(fields: [loadId], references: [id], onDelete: Cascade)
  expenseId     String?
  expense       Expense?           @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  truckId       String?
  truck         Truck?             @relation(fields: [truckId], references: [id], onDelete: Cascade)
  maintenanceId String?
  maintenance   MaintenanceRecord? @relation(fields: [maintenanceId], references: [id], onDelete: Cascade)
  type        DocumentType @default(OTHER)
  label       String
  fileName    String
  contentType String
  sizeBytes   Int
  storageKey  String       @unique
  uploadedAt DateTime @default(now())
  @@index([businessId])
  @@index([loadId])
  @@index([expenseId])
  @@index([truckId])
  @@index([maintenanceId])
}
```

## Enums: 22

| Enum | Valores (orden declarado) |
| --- | --- |
| `PaymentStatus` | `PENDING`, `INVOICED`, `PAID` |
| `EquipmentType` | `BOX_TRUCK`, `DRY_VAN`, `REEFER`, `FLATBED`, `POWER_ONLY`, `SPRINTER_VAN`, `OTHER` |
| `LoadCapacity` | `FULL`, `PARTIAL` |
| `ExpenseBehavior` | `FIXED`, `VARIABLE` |
| `ExpenseScope` | `TRUCK`, `BUSINESS` |
| `FinancialTreatment` | `OPERATING`, `INTEREST`, `PRINCIPAL`, `DEBT_UNALLOCATED` |
| `FinancialObligationKind` | `LOAN`, `OPERATING_LEASE`, `UNKNOWN` |
| `DocumentType` | `RATE_CONFIRMATION`, `BOL`, `POD`, `INVOICE`, `RECEIPT`, `REGISTRATION`, `INSURANCE`, `TITLE`, `INSPECTION`, `OTHER` |
| `MaintenanceType` | `OIL_CHANGE`, `OIL_FILTER`, `FUEL_FILTER`, `TIRES`, `BRAKES`, `TRANSMISSION`, `COOLANT`, `BATTERY`, `DOT_INSPECTION`, `STATE_INSPECTION`, `REGISTRATION`, `INSURANCE`, `OTHER` |
| `MaintenanceBasis` | `DATE`, `MILEAGE`, `BOTH` |
| `ReserveKind` | `TAX`, `MAINTENANCE`, `EMERGENCY`, `CUSTOM` |
| `ReserveBasis` | `OPERATING_PROFIT`, `GROSS_REVENUE` |
| `ReserveTransactionType` | `CONTRIBUTION`, `WITHDRAWAL`, `ADJUSTMENT` |
| `SettlementHalf` | `FIRST`, `SECOND` |
| `SettlementStatus` | `OPEN`, `CLOSED` |
| `DriverPayType` | `PERCENT_GROSS`, `PER_LOADED_MILE`, `PER_TOTAL_MILE`, `FLAT_PER_LOAD` |
| `DriverSettlementStatus` | `DRAFT`, `PAID` |
| `DriverSettlementAdjustmentType` | `ACCESSORIAL_PAY`, `REIMBURSEMENT`, `DEDUCTION`, `ADVANCE`, `OTHER_EARNING` |
| `PlanId` | `INDIVIDUAL`, `SOLO`, `OWNER`, `FLEET` |
| `SubscriptionStatus` | `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED` |
| `ExpenseCategory` | `FUEL`, `TOLLS`, `INSURANCE`, `TRUCK_PAYMENT`, `INTEREST_EXPENSE`, `PRINCIPAL_PAYMENT`, `OPERATING_LEASE`, `MAINTENANCE`, `REPAIRS`, `PARKING`, `DISPATCH`, `FACTORING`, `ELD`, `PERMITS`, `REGISTRATION`, `OFFICE`, `PHONE`, `ACCOUNTING`, `DRIVER_PAY`, `OTHER` |
| `MemberRole` | `OWNER`, `ADMIN`, `BOOKKEEPER`, `DISPATCHER`, `VIEWER` |

## Índices, claves y CHECK SQL exactos

Las FK tienen `ON UPDATE CASCADE`; cada acción `ON DELETE` se preserva tal como aparece. Los índices UNIQUE permiten múltiples NULL con la semántica PostgreSQL actual. Los nombres físicos distinguen mayúsculas.

### 00000000000000_baseline

```sql
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_businessId_idx" ON "User"("businessId");
CREATE UNIQUE INDEX "FinancialGoal_businessId_key" ON "FinancialGoal"("businessId");
CREATE UNIQUE INDEX "Subscription_businessId_key" ON "Subscription"("businessId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE INDEX "ReserveAccount_businessId_idx" ON "ReserveAccount"("businessId");
CREATE INDEX "ReserveTransaction_businessId_date_idx" ON "ReserveTransaction"("businessId", "date");
CREATE INDEX "ReserveTransaction_accountId_idx" ON "ReserveTransaction"("accountId");
CREATE INDEX "ReserveTransaction_settlementId_idx" ON "ReserveTransaction"("settlementId");
CREATE INDEX "Settlement_businessId_periodStart_idx" ON "Settlement"("businessId", "periodStart");
CREATE UNIQUE INDEX "Settlement_businessId_month_half_key" ON "Settlement"("businessId", "month", "half");
CREATE UNIQUE INDEX "FinancialSettings_businessId_key" ON "FinancialSettings"("businessId");
CREATE INDEX "Truck_businessId_idx" ON "Truck"("businessId");
CREATE INDEX "Load_businessId_date_idx" ON "Load"("businessId", "date");
CREATE INDEX "Load_truckId_date_idx" ON "Load"("truckId", "date");
CREATE INDEX "Load_driverId_date_idx" ON "Load"("driverId", "date");
CREATE INDEX "Load_status_idx" ON "Load"("status");
CREATE UNIQUE INDEX "Load_businessId_invoiceNumber_key" ON "Load"("businessId", "invoiceNumber");
CREATE INDEX "Expense_businessId_date_idx" ON "Expense"("businessId", "date");
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
CREATE INDEX "Expense_loadId_idx" ON "Expense"("loadId");
CREATE INDEX "Expense_truckId_date_idx" ON "Expense"("truckId", "date");
CREATE INDEX "Expense_obligationId_idx" ON "Expense"("obligationId");
CREATE INDEX "FinancialObligation_businessId_active_idx" ON "FinancialObligation"("businessId", "active");
CREATE INDEX "FinancialObligation_truckId_idx" ON "FinancialObligation"("truckId");
CREATE INDEX "PaymentEvent_businessId_date_idx" ON "PaymentEvent"("businessId", "date");
CREATE INDEX "PaymentEvent_loadId_date_idx" ON "PaymentEvent"("loadId", "date");
CREATE INDEX "Driver_businessId_active_idx" ON "Driver"("businessId", "active");
CREATE INDEX "Driver_defaultTruckId_idx" ON "Driver"("defaultTruckId");
CREATE INDEX "DriverSettlement_businessId_periodStart_idx" ON "DriverSettlement"("businessId", "periodStart");
CREATE INDEX "DriverSettlement_driverId_periodStart_idx" ON "DriverSettlement"("driverId", "periodStart");
CREATE UNIQUE INDEX "DriverSettlementLine_loadId_key" ON "DriverSettlementLine"("loadId");
CREATE UNIQUE INDEX "DriverSettlementLine_expenseId_key" ON "DriverSettlementLine"("expenseId");
CREATE INDEX "DriverSettlementLine_settlementId_idx" ON "DriverSettlementLine"("settlementId");
CREATE INDEX "DriverSettlementLine_truckId_idx" ON "DriverSettlementLine"("truckId");
CREATE UNIQUE INDEX "FuelEntry_expenseId_key" ON "FuelEntry"("expenseId");
CREATE INDEX "FuelEntry_businessId_date_idx" ON "FuelEntry"("businessId", "date");
CREATE INDEX "FuelEntry_truckId_odometer_idx" ON "FuelEntry"("truckId", "odometer");
CREATE UNIQUE INDEX "MaintenanceRecord_expenseId_key" ON "MaintenanceRecord"("expenseId");
CREATE INDEX "MaintenanceRecord_businessId_serviceDate_idx" ON "MaintenanceRecord"("businessId", "serviceDate");
CREATE INDEX "MaintenanceRecord_truckId_type_idx" ON "MaintenanceRecord"("truckId", "type");
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE INDEX "Document_businessId_idx" ON "Document"("businessId");
CREATE INDEX "Document_loadId_idx" ON "Document"("loadId");
CREATE INDEX "Document_expenseId_idx" ON "Document"("expenseId");
CREATE INDEX "Document_truckId_idx" ON "Document"("truckId");
CREATE INDEX "Document_maintenanceId_idx" ON "Document"("maintenanceId");
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReserveAccount" ADD CONSTRAINT "ReserveAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReserveAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReserveTransaction" ADD CONSTRAINT "ReserveTransaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialSettings" ADD CONSTRAINT "FinancialSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Load" ADD CONSTRAINT "Load_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Load" ADD CONSTRAINT "Load_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Load" ADD CONSTRAINT "Load_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "FinancialObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialObligation" ADD CONSTRAINT "FinancialObligation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialObligation" ADD CONSTRAINT "FinancialObligation_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_defaultTruckId_fkey" FOREIGN KEY ("defaultTruckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "DriverSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "MaintenanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### 20260901223000_driver_settlement_adjustments

```sql
-- Add the operational additions and reductions that turn frozen base pay into
-- a complete driver statement. These remain deliberately separate from tax,
-- withholding and banking data: OnRoad Books is not a payroll processor.
CREATE TYPE "DriverSettlementAdjustmentType" AS ENUM (
  'ACCESSORIAL_PAY',
  'REIMBURSEMENT',
  'DEDUCTION',
  'ADVANCE',
  'OTHER_EARNING'
);

CREATE TABLE "DriverSettlementAdjustment" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "type" "DriverSettlementAdjustmentType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverSettlementAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverSettlementAdjustment_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "DriverSettlementAdjustment_reason_present" CHECK (char_length(trim("reason")) >= 2)
);

CREATE INDEX "DriverSettlementAdjustment_settlementId_createdAt_idx"
  ON "DriverSettlementAdjustment"("settlementId", "createdAt");

ALTER TABLE "DriverSettlementAdjustment"
  ADD CONSTRAINT "DriverSettlementAdjustment_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "DriverSettlement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

### 20260902013000_truck_ifta_reporting_scope

```sql
-- IFTA filing scope is an owner-confirmed decision per power unit. Existing
-- trucks remain NULL so a migration never silently includes or excludes them.
ALTER TABLE "Truck"
  ADD COLUMN "iftaReportingEnabled" BOOLEAN;
```

### 20260902220000_truck_financing_confirmation

```sql
ALTER TABLE "Truck"
  ADD COLUMN "financingConfirmedNone" BOOLEAN;
```

### 20260902223000_fleet_overhead_allocation

```sql
-- Existing businesses remain conservative until the owner explicitly chooses
-- a deterministic Fleet allocation method in Settings.
ALTER TABLE "FinancialSettings"
ADD COLUMN "fleetOverheadAllocation" TEXT NOT NULL DEFAULT 'UNALLOCATED';

ALTER TABLE "FinancialSettings"
ADD CONSTRAINT "FinancialSettings_fleetOverheadAllocation_check"
CHECK ("fleetOverheadAllocation" IN ('UNALLOCATED', 'FLEET_MILES'));
```

### 20260902230000_truck_operating_cost_coverage

```sql
-- Unknown remains the default. Only explicit owner exemptions are persisted;
-- recorded coverage is derived from the expense ledger in the same cost window.
ALTER TABLE "Truck"
ADD COLUMN "operatingCostExemptions" JSONB NOT NULL DEFAULT '{}'::jsonb;
```

### 20260903060000_financial_obligation_debt_terms

```sql
ALTER TABLE "FinancialObligation"
  ADD COLUMN "startingBalance" DECIMAL(12,2),
  ADD COLUMN "aprPercent" DECIMAL(5,2),
  ADD COLUMN "paymentDueDay" INTEGER;
```

## Queries del adaptador de producción

205 llamadas directas estáticas en `src/lib/db/prisma-store.ts`. Los inserts anidados de Prisma también están incluidos dentro del texto de la llamada padre. No son 205 viajes SQL por petición: Prisma decide cómo expandir relaciones y las ramas condicionales no siempre se ejecutan.

El [inventario JSON](supabase-query-inventory.json) contiene cada expresión completa, con `where`, `select`, `include`, `orderBy`, `data`, contexto y línea, más transacciones, consumidores y scripts operativos.

| Método / helper | Tablas y operaciones | Líneas |
| --- | --- | --- |
| `checkPostgresConnection` | `SQL.$queryRawUnsafe` | 140 |
| `syncPrismaLoadExpenses` | `FuelEntry.count`, `Expense.deleteMany`, `Expense.upsert` | 197, 211, 229 |
| `ownedLoadId` | `Load.findFirst` | 270 |
| `ownedDriverId` | `Driver.count` | 286 |
| `assertDocumentTargets` | `Load.count`, `Expense.count`, `MaintenanceRecord.count` | 303, 306, 309 |
| `ensureReserveAccounts` | `ReserveAccount.count`, `ReserveAccount.create` | 328, 331 |
| `listAccounts` | `User.findMany` | 362 |
| `countUsers` | `User.count` | 459 |
| `findUserByEmail` | `User.findUnique` | 464 |
| `findUserById` | `User.findUnique` | 470 |
| `listMembers` | `User.findMany` | 476 |
| `createMember` | `Business.findUnique`, `User.findUnique`, `User.create` | 494, 496, 500 |
| `updateMemberRole` | `User.findFirst`, `User.update` | 522, 525 |
| `markMemberJoined` | `User.findFirst`, `User.update` | 533, 537 |
| `removeMember` | `User.findFirst`, `User.delete` | 545, 548 |
| `createOwner` | `User.findUnique`, `Business.create`, `User.create` | 564, 568, 585 |
| `resetBusinessData` | `User.findFirst`, `Document.findMany`, `Document.deleteMany`, `FuelEntry.deleteMany`, `MaintenanceRecord.deleteMany`, `DriverSettlement.deleteMany`, `PaymentEvent.deleteMany`, `Expense.deleteMany`, `Load.deleteMany`, `FinancialObligation.deleteMany`, `Driver.deleteMany`, `Truck.deleteMany`, `ReserveTransaction.deleteMany`, `Settlement.deleteMany`, `ReserveAccount.deleteMany`, `FinancialGoal.deleteMany`, `FinancialSettings.deleteMany`, `Truck.create`, `FinancialSettings.create`, `FinancialGoal.create`, `ReserveAccount.create` | 606, 610, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 631, 632, 636, 649 |
| `deleteAccount` | `User.findFirst`, `Document.findMany`, `User.deleteMany`, `Business.delete` | 674, 678, 685, 686 |
| `business` | `Business.findUnique`, `Truck.create` | 719, 728 |
| `getDataset` | `Load.findMany`, `Expense.findMany`, `FuelEntry.findMany`, `Document.findMany`, `MaintenanceRecord.findMany`, `FinancialGoal.findUnique`, `Subscription.findUnique`, `ReserveAccount.findMany`, `ReserveTransaction.findMany`, `Settlement.findMany`, `Driver.findMany`, `DriverSettlement.findMany`, `FinancialObligation.findMany`, `PaymentEvent.findMany` | 761, 765, 769, 773, 777, 781, 782, 783, 787, 791, 795, 799, 807, 811, 826 |
| `createLoad` | `Load.create`, `Truck.updateMany` | 1250, 1255 |
| `updateLoad` | `Load.findFirst`, `PaymentEvent.count`, `DriverSettlementLine.count`, `Expense.count`, `FuelEntry.count`, `Load.update`, `Truck.updateMany` | 1272, 1274, 1279, 1289, 1297, 1307, 1313 |
| `updateLoadJurisdictionMiles` | `Load.findFirst`, `Load.update` | 1330, 1338 |
| `updateLoadExpense` | `Expense.findFirst`, `Load.findFirst`, `Load.update` | 1352, 1364, 1371 |
| `deleteLoad` | `Load.findFirst`, `DriverSettlementLine.count`, `Expense.deleteMany`, `Load.delete` | 1387, 1389, 1395, 1401 |
| `createDriver` | `Driver.create` | 1411 |
| `updateDriver` | `Driver.updateMany` | 1431 |
| `setDriverActive` | `Driver.updateMany` | 1449 |
| `createDriverSettlement` | `Driver.findFirst`, `Load.findMany`, `DriverSettlement.create` | 1462, 1466, 1478 |
| `addDriverSettlementAdjustment` | `DriverSettlement.findFirst`, `DriverSettlementAdjustment.create` | 1518, 1531 |
| `deleteDriverSettlementAdjustment` | `DriverSettlement.findFirst`, `DriverSettlementAdjustment.deleteMany` | 1552, 1557 |
| `payDriverSettlement` | `DriverSettlement.findFirst`, `Expense.upsert`, `DriverSettlementLine.update`, `Load.update`, `DriverSettlement.update` | 1567, 1620, 1639, 1643, 1648 |
| `deleteDriverSettlement` | `DriverSettlement.findFirst`, `DriverSettlement.delete` | 1660, 1667 |
| `createExpense` | `Expense.create` | 1694 |
| `updateExpense` | `DriverSettlementLine.count`, `FuelEntry.count`, `MaintenanceRecord.count`, `Expense.findFirst`, `Expense.updateMany` | 1710, 1714, 1717, 1723, 1735 |
| `deleteExpense` | `Expense.findFirst`, `Expense.findMany`, `DriverSettlementLine.count`, `FuelEntry.count`, `Expense.deleteMany` | 1757, 1763, 1769, 1776, 1779 |
| `createFinancialObligation` | `FinancialObligation.create`, `Truck.updateMany` | 1799, 1816 |
| `updateFinancialObligation` | `FinancialObligation.findFirst`, `Expense.count`, `FinancialObligation.update`, `Truck.updateMany` | 1838, 1845, 1849, 1866 |
| `classifyDebtPayment` | `Expense.findFirst`, `FinancialObligation.create`, `Truck.updateMany`, `FinancialObligation.findFirst`, `FinancialObligation.update`, `Expense.update`, `Expense.findMany`, `Expense.create`, `Expense.deleteMany` | 1882, 1901, 1920, 1928, 1941, 1954, 1965, 1979, 1994, 2026, 2047, 2063, 2085, 2102, 2115, 2128, 2140 |
| `createPaymentEvent` | `Load.findFirst`, `PaymentEvent.findMany`, `PaymentEvent.create`, `Load.update` | 2168, 2170, 2176, 2188 |
| `createFuelEntry` | `FuelEntry.create`, `Expense.create`, `FuelEntry.update`, `Load.findFirst`, `Truck.updateMany` | 2224, 2231, 2244, 2246, 2252 |
| `updateFuelEntry` | `FuelEntry.findFirst`, `FuelEntry.updateMany`, `Expense.updateMany`, `Expense.create`, `Truck.updateMany`, `Load.findFirst` | 2274, 2276, 2293, 2298, 2306, 2312, 2318 |
| `deleteFuelEntry` | `FuelEntry.findFirst`, `FuelEntry.deleteMany`, `Expense.deleteMany`, `Load.findFirst` | 2331, 2333, 2337, 2342 |
| `createMaintenance` | `Expense.create`, `Truck.updateMany`, `MaintenanceRecord.create` | 2377, 2394, 2400 |
| `updateMaintenance` | `MaintenanceRecord.findFirst`, `Expense.updateMany`, `Expense.create`, `Expense.deleteMany`, `MaintenanceRecord.updateMany` | 2414, 2429, 2434, 2446, 2450 |
| `deleteMaintenance` | `MaintenanceRecord.findFirst`, `MaintenanceRecord.deleteMany`, `Expense.deleteMany` | 2465, 2469, 2471 |
| `createDocument` | `Document.create` | 2484 |
| `deleteDocument` | `Document.findFirst`, `Document.deleteMany` | 2505, 2509 |
| `updateSettings` | `FinancialSettings.upsert` | 2516 |
| `updateBusiness` | `Business.update` | 2556 |
| `createTruck` | `Truck.findFirst`, `Truck.create` | 2568, 2573 |
| `updateTruck` | `Truck.updateMany` | 2607 |
| `setTruckFinancingConfirmedNone` | `Truck.updateMany` | 2653 |
| `setTruckOperatingCostExemptions` | `Truck.updateMany` | 2669 |
| `archiveTruck` | `Truck.count`, `Truck.updateMany` | 2683, 2687 |
| `restoreTruck` | `Truck.updateMany` | 2700 |
| `updateSubscription` | `Subscription.upsert` | 2725 |
| `updateGoals` | `FinancialGoal.upsert` | 2745 |
| `createReserveAccount` | `ReserveAccount.count`, `ReserveAccount.create` | 2759, 2760 |
| `updateReserveAccount` | `ReserveAccount.findFirst`, `ReserveAccount.update` | 2780, 2785 |
| `deleteReserveAccount` | `ReserveAccount.findFirst`, `ReserveAccount.delete` | 2806, 2813 |
| `createReserveTransaction` | `ReserveAccount.findFirst`, `ReserveTransaction.create` | 2819, 2832 |
| `deleteReserveTransaction` | `ReserveTransaction.findFirst`, `ReserveTransaction.delete` | 2859, 2868 |
| `ensureSettlement` | `Settlement.upsert` | 2882 |
| `closeSettlement` | `Settlement.findFirst`, `Settlement.update`, `ReserveAccount.findMany`, `ReserveTransaction.create` | 2900, 2905, 2920, 2931 |
| `reopenSettlement` | `Settlement.findFirst`, `ReserveTransaction.deleteMany`, `Settlement.update` | 2951, 2959, 2960 |
| `updateSettlementNotes` | `Settlement.findFirst`, `Settlement.update` | 2972, 2974 |

## Transacciones del adaptador

| Método | Línea | Isolation / opciones explícitas |
| --- | --- | --- |
| `createOwner` | 563 | `default` |
| `resetBusinessData` | 605 | `default` |
| `deleteAccount` | 673 | `default` |
| `createLoad` | 1248 | `default` |
| `updateLoad` | 1270 | `default` |
| `updateLoadJurisdictionMiles` | 1329 | `default` |
| `updateLoadExpense` | 1351 | `default` |
| `deleteLoad` | 1386 | `default` |
| `createDriverSettlement` | 1461 | `default` |
| `payDriverSettlement` | 1566 | `default` |
| `deleteExpense` | 1756 | `{ isolationLevel: "Serializable" }` |
| `createFinancialObligation` | 1798 | `default` |
| `updateFinancialObligation` | 1837 | `{ isolationLevel: "Serializable" }` |
| `classifyDebtPayment` | 1881 | `{ isolationLevel: "Serializable" }` |
| `createPaymentEvent` | 2167 | `{ isolationLevel: "Serializable" }` |
| `createFuelEntry` | 2223 | `default` |
| `updateFuelEntry` | 2273 | `default` |
| `deleteFuelEntry` | 2330 | `default` |
| `createMaintenance` | 2373 | `default` |
| `updateMaintenance` | 2413 | `default` |
| `deleteMaintenance` | 2464 | `default` |
| `closeSettlement` | 2904 | `default` |
| `reopenSettlement` | 2958 | `default` |

## Consumidores server-side

Índice estático de llamadas a las fábricas de datos, auth y storage; incluye tests/scripts para no omitir acoplamientos de verificación. Las rutas consumidoras conservan sus contratos mientras se sustituye el adaptador.

| Archivo | Llamadas (líneas) |
| --- | --- |
| `src/app/(app)/admin/page.tsx` | `getAuthStore`:22 |
| `src/app/(app)/analytics/brokers/page.tsx` | `getDataset`:77 |
| `src/app/(app)/analytics/cost-per-mile/page.tsx` | `getDataset`:65 |
| `src/app/(app)/analytics/lanes/page.tsx` | `getDataset`:65 |
| `src/app/(app)/calculator/page.tsx` | `getDataset`:67 |
| `src/app/(app)/dashboard/page.tsx` | `getDataset`:138 |
| `src/app/(app)/driver-settlements/[id]/page.tsx` | `getDataset`:37 |
| `src/app/(app)/driver-settlements/page.tsx` | `getDataset`:40 |
| `src/app/(app)/drivers/[id]/page.tsx` | `getDataset`:42 |
| `src/app/(app)/drivers/page.tsx` | `getDataset`:32 |
| `src/app/(app)/expenses/page.tsx` | `getDataset`:47 |
| `src/app/(app)/financing/page.tsx` | `getDataset`:33 |
| `src/app/(app)/fleet/[truckId]/page.tsx` | `getDataset`:74 |
| `src/app/(app)/fleet/page.tsx` | `getDataset`:72 |
| `src/app/(app)/fuel/page.tsx` | `getDataset`:63 |
| `src/app/(app)/ifta/page.tsx` | `getDataset`:84 |
| `src/app/(app)/invoices/page.tsx` | `getDataset`:37 |
| `src/app/(app)/layout.tsx` | `getDataset`:13 |
| `src/app/(app)/loads/[id]/page.tsx` | `getDataset`:60 |
| `src/app/(app)/loads/page.tsx` | `getDataset`:54 |
| `src/app/(app)/plans/page.tsx` | `getDataset`:30 |
| `src/app/(app)/reports/page.tsx` | `getDataset`:91 |
| `src/app/(app)/reserves/page.tsx` | `getDataset`:78 |
| `src/app/(app)/settings/page.tsx` | `getDataset`:49, `getAuthStore`:50, `getAuthStore`:67 |
| `src/app/(app)/settlements/page.tsx` | `getDataset`:68 |
| `src/app/(app)/truck/page.tsx` | `getDataset`:56 |
| `src/app/api/auth/callback/route.ts` | `createSupabaseServerClient`:31 |
| `src/app/api/auth/google/oauth/route.ts` | `createSupabaseServerClient`:26 |
| `src/app/api/auth/google/route.ts` | `createSupabaseServerClient`:51 |
| `src/app/api/auth/invite/accept/route.ts` | `createSupabaseServerClient`:42, `getAuthStore`:56 |
| `src/app/api/auth/login/route.ts` | `getAuthStore`:22 |
| `src/app/api/auth/setup/route.ts` | `getAuthStore`:19 |
| `src/app/api/documents/[id]/route.ts` | `getRepository`:21, `getDocumentStorage`:34, `getRepository`:79, `getDocumentStorage`:106 |
| `src/app/api/documents/route.ts` | `getRepository`:37, `getDocumentStorage`:109 |
| `src/app/api/documents/upload/complete/route.ts` | `getRepository`:50, `getDocumentStorage`:58 |
| `src/app/api/documents/upload/prepare/route.ts` | `getRepository`:31, `getDocumentStorage`:35 |
| `src/app/api/export/[report]/route.ts` | `getRepository`:37 |
| `src/app/api/export/driver-settlement/[id]/route.ts` | `getRepository`:18 |
| `src/app/api/export/ifta/route.ts` | `getRepository`:18 |
| `src/app/api/export/invoice/[id]/route.ts` | `getRepository`:12 |
| `src/app/api/export/year-end/route.ts` | `getRepository`:15 |
| `src/app/api/mobile/analytics/route.ts` | `getRepository`:33 |
| `src/app/api/mobile/auth/exchange/route.ts` | `getAuthStore`:36 |
| `src/app/api/mobile/calculator/route.ts` | `getRepository`:65 |
| `src/app/api/mobile/dashboard/route.ts` | `getRepository`:55 |
| `src/app/api/mobile/documents/route.ts` | `getRepository`:74, `getDocumentStorage`:93 |
| `src/app/api/mobile/driver-settlements/[id]/route.ts` | `getRepository`:31 |
| `src/app/api/mobile/driver-settlements/route.ts` | `getRepository`:28 |
| `src/app/api/mobile/drivers/route.ts` | `getRepository`:24 |
| `src/app/api/mobile/expenses/[id]/debt-payment/route.ts` | `getRepository`:29 |
| `src/app/api/mobile/expenses/[id]/route.ts` | `getRepository`:24, `getRepository`:87, `getRepository`:144 |
| `src/app/api/mobile/expenses/route.ts` | `getRepository`:23 |
| `src/app/api/mobile/fleet/route.ts` | `getRepository`:27 |
| `src/app/api/mobile/fuel/[id]/route.ts` | `getRepository`:21, `getRepository`:71, `getRepository`:118 |
| `src/app/api/mobile/fuel/route.ts` | `getRepository`:28 |
| `src/app/api/mobile/ifta/route.ts` | `getRepository`:29 |
| `src/app/api/mobile/invoices/route.ts` | `getRepository`:25 |
| `src/app/api/mobile/loads/[id]/route.ts` | `getRepository`:28, `getRepository`:131, `getRepository`:171 |
| `src/app/api/mobile/loads/route.ts` | `getRepository`:29 |
| `src/app/api/mobile/login/route.ts` | `getAuthStore`:23 |
| `src/app/api/mobile/reports/[report]/route.ts` | `getRepository`:48 |
| `src/app/api/mobile/reserves/route.ts` | `getRepository`:32 |
| `src/app/api/mobile/settlements/route.ts` | `getRepository`:38 |
| `src/app/api/mobile/team/[userId]/route.ts` | `getAuthStore`:39, `getAuthStore`:68, `deleteSupabaseAuthUserByEmail`:75 |
| `src/app/api/mobile/team/route.ts` | `getRepository`:29, `getAuthStore`:39, `getAuthStore`:85, `inviteSupabaseAuthUser`:102 |
| `src/app/api/mobile/truck/route.ts` | `getRepository`:25 |
| `src/app/api/mobile/year-end/route.ts` | `getRepository`:20 |
| `src/app/api/rate-con/scan/route.ts` | `getRepository`:68 |
| `src/app/welcome/page.tsx` | `getRepository`:29 |
| `src/lib/actions/account.ts` | `getDocumentStorage`:15, `getAuthStore`:29, `getAuthStore`:48, `createSupabaseServerClient`:56, `deleteSupabaseAuthUserByEmail`:62 |
| `src/lib/actions/admin.ts` | `getAuthStore`:50, `getDocumentStorage`:56, `getRepository`:78, `getRepository`:123, `getAuthStore`:160, `getAuthStore`:190, `deleteSupabaseAuthUserByEmail`:193 |
| `src/lib/actions/billing.ts` | `getRepository`:32, `getRepository`:93 |
| `src/lib/actions/bookkeeping.ts` | `getRepository`:33 |
| `src/lib/actions/expenses.ts` | `getRepository`:30, `getRepository`:53, `getRepository`:71, `getRepository`:84, `getRepository`:105 |
| `src/lib/actions/financing.ts` | `getRepository`:29, `getRepository`:54 |
| `src/lib/actions/fuel.ts` | `getRepository`:25, `getRepository`:40, `getRepository`:50 |
| `src/lib/actions/guards.ts` | `getRepository`:25 |
| `src/lib/actions/ifta.ts` | `getRepository`:16, `getRepository`:42 |
| `src/lib/actions/invoices.ts` | `getRepository`:31, `getRepository`:54, `getRepository`:84, `getRepository`:98 |
| `src/lib/actions/loads.ts` | `getRepository`:88, `getRepository`:112, `getRepository`:126, `getRepository`:142 |
| `src/lib/actions/maintenance.ts` | `getRepository`:29, `getRepository`:58, `getRepository`:75 |
| `src/lib/actions/settings.ts` | `getRepository`:21, `getRepository`:54 |
| `src/lib/actions/team.ts` | `getRepository`:18, `getAuthStore`:42, `inviteSupabaseAuthUser`:52, `getAuthStore`:77, `getAuthStore`:93, `deleteSupabaseAuthUserByEmail`:102 |
| `src/lib/actions/trucks.ts` | `getRepository`:43, `getRepository`:70, `getRepository`:93, `getRepository`:138, `getRepository`:169, `getRepository`:182 |
| `src/lib/auth/complete-supabase-sign-in.ts` | `getAuthStore`:31 |
| `src/lib/auth/index.ts` | `getAuthStore`:23, `getDataset`:56, `getAuthStore`:86 |
| `src/lib/auth/mobile.ts` | `getAuthStore`:40, `getRepository`:78, `getRepository`:126 |
| `src/lib/billing.ts` | `getRepository`:65 |
| `src/lib/db/index.ts` | `getRepository`:52 |
| `src/lib/jobs/post-recurring-expenses.ts` | `getAuthStore`:48, `getRepository`:53 |
| `src/lib/operational-health.ts` | `getDocumentStorage`:65 |
| `src/lib/storage/index.ts` | `getDocumentStorage`:96 |
