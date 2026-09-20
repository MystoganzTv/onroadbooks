import { relations } from "drizzle-orm";
import { user } from "./users";
import { business } from "./businesses";
import { financialGoal } from "./goals";
import { subscription } from "./subscriptions";
import { reserveAccount } from "./reserve-accounts";
import { reserveTransaction } from "./reserve-transactions";
import { settlement } from "./settlements";
import { financialSettings } from "./settings";
import { truck } from "./trucks";
import { load } from "./loads";
import { expense } from "./expenses";
import { financialObligation } from "./obligations";
import { paymentEvent } from "./payments";
import { driver } from "./drivers";
import { driverSettlement } from "./driver-settlements";
import { driverSettlementAdjustment } from "./driver-settlement-adjustments";
import { driverSettlementLine } from "./driver-settlement-lines";
import { fuelEntry } from "./fuel";
import { maintenanceRecord } from "./maintenance";
import { document } from "./documents";

export const userRelations = relations(user, ({ one }) => ({
  business: one(business, { relationName: "BusinessToUser", fields: [user.businessId], references: [business.id] }),
}));

export const businessRelations = relations(business, ({ many, one }) => ({
  users: many(user, { relationName: "BusinessToUser" }),
  trucks: many(truck, { relationName: "BusinessToTruck" }),
  loads: many(load, { relationName: "BusinessToLoad" }),
  expenses: many(expense, { relationName: "BusinessToExpense" }),
  financialObligations: many(financialObligation, { relationName: "BusinessToFinancialObligation" }),
  paymentEvents: many(paymentEvent, { relationName: "BusinessToPaymentEvent" }),
  fuelEntries: many(fuelEntry, { relationName: "BusinessToFuelEntry" }),
  documents: many(document, { relationName: "BusinessToDocument" }),
  maintenance: many(maintenanceRecord, { relationName: "BusinessToMaintenanceRecord" }),
  settings: one(financialSettings),
  goals: one(financialGoal),
  subscription: one(subscription),
  reserveAccounts: many(reserveAccount, { relationName: "BusinessToReserveAccount" }),
  reserveTransactions: many(reserveTransaction, { relationName: "BusinessToReserveTransaction" }),
  settlements: many(settlement, { relationName: "BusinessToSettlement" }),
  drivers: many(driver, { relationName: "BusinessToDriver" }),
  driverSettlements: many(driverSettlement, { relationName: "BusinessToDriverSettlement" }),
}));

export const financialGoalRelations = relations(financialGoal, ({ one }) => ({
  business: one(business, { relationName: "BusinessToFinancialGoal", fields: [financialGoal.businessId], references: [business.id] }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  business: one(business, { relationName: "BusinessToSubscription", fields: [subscription.businessId], references: [business.id] }),
}));

export const reserveAccountRelations = relations(reserveAccount, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToReserveAccount", fields: [reserveAccount.businessId], references: [business.id] }),
  transactions: many(reserveTransaction, { relationName: "ReserveAccountToReserveTransaction" }),
}));

export const reserveTransactionRelations = relations(reserveTransaction, ({ one }) => ({
  business: one(business, { relationName: "BusinessToReserveTransaction", fields: [reserveTransaction.businessId], references: [business.id] }),
  account: one(reserveAccount, { relationName: "ReserveAccountToReserveTransaction", fields: [reserveTransaction.accountId], references: [reserveAccount.id] }),
  settlement: one(settlement, { relationName: "ReserveTransactionToSettlement", fields: [reserveTransaction.settlementId], references: [settlement.id] }),
}));

export const settlementRelations = relations(settlement, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToSettlement", fields: [settlement.businessId], references: [business.id] }),
  reserveTransactions: many(reserveTransaction, { relationName: "ReserveTransactionToSettlement" }),
}));

export const financialSettingsRelations = relations(financialSettings, ({ one }) => ({
  business: one(business, { relationName: "BusinessToFinancialSettings", fields: [financialSettings.businessId], references: [business.id] }),
}));

export const truckRelations = relations(truck, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToTruck", fields: [truck.businessId], references: [business.id] }),
  loads: many(load, { relationName: "LoadToTruck" }),
  expenses: many(expense, { relationName: "ExpenseToTruck" }),
  financialObligations: many(financialObligation, { relationName: "FinancialObligationToTruck" }),
  fuelEntries: many(fuelEntry, { relationName: "FuelEntryToTruck" }),
  documents: many(document, { relationName: "DocumentToTruck" }),
  maintenance: many(maintenanceRecord, { relationName: "MaintenanceRecordToTruck" }),
  defaultDrivers: many(driver, { relationName: "DriverDefaultTruck" }),
  driverSettlementLines: many(driverSettlementLine, { relationName: "DriverSettlementLineToTruck" }),
}));

export const loadRelations = relations(load, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToLoad", fields: [load.businessId], references: [business.id] }),
  truck: one(truck, { relationName: "LoadToTruck", fields: [load.truckId], references: [truck.id] }),
  driver: one(driver, { relationName: "DriverToLoad", fields: [load.driverId], references: [driver.id] }),
  expenses: many(expense, { relationName: "ExpenseToLoad" }),
  fuelEntries: many(fuelEntry, { relationName: "FuelEntryToLoad" }),
  documents: many(document, { relationName: "DocumentToLoad" }),
  driverSettlementLine: one(driverSettlementLine),
  paymentEvents: many(paymentEvent, { relationName: "LoadToPaymentEvent" }),
}));

export const expenseRelations = relations(expense, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToExpense", fields: [expense.businessId], references: [business.id] }),
  truck: one(truck, { relationName: "ExpenseToTruck", fields: [expense.truckId], references: [truck.id] }),
  load: one(load, { relationName: "ExpenseToLoad", fields: [expense.loadId], references: [load.id] }),
  obligation: one(financialObligation, { relationName: "ExpenseToFinancialObligation", fields: [expense.obligationId], references: [financialObligation.id] }),
  documents: many(document, { relationName: "DocumentToExpense" }),
  maintenance: many(maintenanceRecord, { relationName: "ExpenseToMaintenanceRecord" }),
  fuelEntry: one(fuelEntry),
  driverSettlementLine: one(driverSettlementLine),
}));

export const financialObligationRelations = relations(financialObligation, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToFinancialObligation", fields: [financialObligation.businessId], references: [business.id] }),
  truck: one(truck, { relationName: "FinancialObligationToTruck", fields: [financialObligation.truckId], references: [truck.id] }),
  expenses: many(expense, { relationName: "ExpenseToFinancialObligation" }),
}));

export const paymentEventRelations = relations(paymentEvent, ({ one }) => ({
  business: one(business, { relationName: "BusinessToPaymentEvent", fields: [paymentEvent.businessId], references: [business.id] }),
  load: one(load, { relationName: "LoadToPaymentEvent", fields: [paymentEvent.loadId], references: [load.id] }),
}));

export const driverRelations = relations(driver, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToDriver", fields: [driver.businessId], references: [business.id] }),
  defaultTruck: one(truck, { relationName: "DriverDefaultTruck", fields: [driver.defaultTruckId], references: [truck.id] }),
  loads: many(load, { relationName: "DriverToLoad" }),
  settlements: many(driverSettlement, { relationName: "DriverToDriverSettlement" }),
}));

export const driverSettlementRelations = relations(driverSettlement, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToDriverSettlement", fields: [driverSettlement.businessId], references: [business.id] }),
  driver: one(driver, { relationName: "DriverToDriverSettlement", fields: [driverSettlement.driverId], references: [driver.id] }),
  lines: many(driverSettlementLine, { relationName: "DriverSettlementToDriverSettlementLine" }),
  adjustments: many(driverSettlementAdjustment, { relationName: "DriverSettlementToDriverSettlementAdjustment" }),
}));

export const driverSettlementAdjustmentRelations = relations(driverSettlementAdjustment, ({ one }) => ({
  settlement: one(driverSettlement, { relationName: "DriverSettlementToDriverSettlementAdjustment", fields: [driverSettlementAdjustment.settlementId], references: [driverSettlement.id] }),
}));

export const driverSettlementLineRelations = relations(driverSettlementLine, ({ one }) => ({
  settlement: one(driverSettlement, { relationName: "DriverSettlementToDriverSettlementLine", fields: [driverSettlementLine.settlementId], references: [driverSettlement.id] }),
  load: one(load, { relationName: "DriverSettlementLineToLoad", fields: [driverSettlementLine.loadId], references: [load.id] }),
  truck: one(truck, { relationName: "DriverSettlementLineToTruck", fields: [driverSettlementLine.truckId], references: [truck.id] }),
  expense: one(expense, { relationName: "DriverSettlementExpense", fields: [driverSettlementLine.expenseId], references: [expense.id] }),
}));

export const fuelEntryRelations = relations(fuelEntry, ({ one }) => ({
  business: one(business, { relationName: "BusinessToFuelEntry", fields: [fuelEntry.businessId], references: [business.id] }),
  truck: one(truck, { relationName: "FuelEntryToTruck", fields: [fuelEntry.truckId], references: [truck.id] }),
  load: one(load, { relationName: "FuelEntryToLoad", fields: [fuelEntry.loadId], references: [load.id] }),
  expense: one(expense, { relationName: "FuelEntryExpense", fields: [fuelEntry.expenseId], references: [expense.id] }),
}));

export const maintenanceRecordRelations = relations(maintenanceRecord, ({ one, many }) => ({
  business: one(business, { relationName: "BusinessToMaintenanceRecord", fields: [maintenanceRecord.businessId], references: [business.id] }),
  truck: one(truck, { relationName: "MaintenanceRecordToTruck", fields: [maintenanceRecord.truckId], references: [truck.id] }),
  expense: one(expense, { relationName: "ExpenseToMaintenanceRecord", fields: [maintenanceRecord.expenseId], references: [expense.id] }),
  documents: many(document, { relationName: "DocumentToMaintenanceRecord" }),
}));

export const documentRelations = relations(document, ({ one }) => ({
  business: one(business, { relationName: "BusinessToDocument", fields: [document.businessId], references: [business.id] }),
  load: one(load, { relationName: "DocumentToLoad", fields: [document.loadId], references: [load.id] }),
  expense: one(expense, { relationName: "DocumentToExpense", fields: [document.expenseId], references: [expense.id] }),
  truck: one(truck, { relationName: "DocumentToTruck", fields: [document.truckId], references: [truck.id] }),
  maintenance: one(maintenanceRecord, { relationName: "DocumentToMaintenanceRecord", fields: [document.maintenanceId], references: [maintenanceRecord.id] }),
}));
