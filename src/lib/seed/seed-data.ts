/**
 * Deterministic reference fixture.
 *
 * August 2026 is hand-authored so the numbers tell a coherent operational
 * story (real regional lanes, matching fuel stops, odometer continuity).
 * May-July 2026 are generated from a deterministic PRNG so trend charts and
 * previous-period comparisons have real history without bloating this file.
 *
 * Nothing here is random at runtime: the same seed always produces the same
 * dataset, so screenshots and tests stay stable.
 */

import { defaultCategoryBehavior } from "../categories";
import { roundMoney } from "../calculations";
import { defaultGoals, defaultReserveAccounts, defaultSubscription } from "../defaults";
import { buildSettlementSnapshot, settlementBounds, settlementId } from "../finance/settlement";
import { inferFuelJurisdiction } from "../ifta";
import { pad } from "../periods";
import type {
  Business,
  Dataset,
  Document,
  Expense,
  MaintenanceRecord,
  ExpenseCategoryId,
  FinancialSettings,
  FuelEntry,
  Load,
  PaymentStatus,
  ReserveAccount,
  ReserveTransaction,
  Settlement,
  SettlementHalf,
  Truck,
} from "../types";

const BUSINESS_ID = "biz_boxtruck";
const TRUCK_ID = "truck_001";
const CREATED = "2026-01-15T12:00:00.000Z";

export const FIXTURE_BUSINESS: Business = {
  id: BUSINESS_ID,
  name: "Padron Freight LLC",
  currency: "USD",
  createdAt: CREATED,
};

export const FIXTURE_SETTINGS: FinancialSettings = {
  id: "fin_001",
  businessId: BUSINESS_ID,
  taxReservePct: 20,
  maintenanceReservePct: 5,
  categoryBehavior: defaultCategoryBehavior(),
  ratingGreatPerMile: 2,
  ratingGoodPerMile: 1.5,
  ratingMarginalPerMile: 1,
  deadheadWarnPct: 20,
  maintenanceWarnMiles: 2000,
  maintenanceWarnDays: 30,
  iftaTaxRates: {},
  fleetOverheadAllocation: "UNALLOCATED",
  updatedAt: CREATED,
};

export const FIXTURE_TRUCK: Truck = {
  id: TRUCK_ID,
  acquiredOn: "2026-01-15",
  soldOn: null,
  businessId: BUSINESS_ID,
  name: "Unit 101",
  year: 2021,
  make: "Freightliner",
  model: "M2 106 - 26ft Box",
  vin: "1FVACWDT0MHMK4821",
  purchasePrice: 68500,
  monthlyPayment: 1285,
  monthlyInsurance: 685,
  operatingCostExemptions: {},
  startingOdometer: 118400,
  currentOdometer: 144780,
  active: true,
  createdAt: CREATED,
};

/* ---- August 2026: hand-authored ------------------------------------- */

type LoadSeed = [
  date: string,
  originCity: string,
  originState: string,
  destinationCity: string,
  destinationState: string,
  broker: string,
  loadNumber: string,
  loadedMiles: number,
  deadheadMiles: number,
  grossRate: number,
  fuelCost: number,
  tolls: number,
  dispatchFee: number,
  factoringFee: number,
  otherExpenses: number,
  status: PaymentStatus,
  notes: string,
];

const AUGUST_LOADS: LoadSeed[] = [
  ["2026-08-03", "Herndon", "VA", "Philadelphia", "PA", "Keystone Freight Partners", "KF-24815", 175, 22, 720, 96, 28, 0, 18, 0, "PAID", "Palletized retail freight, dock-to-dock."],
  ["2026-08-04", "Philadelphia", "PA", "Newark", "NJ", "Northline Dispatch Group", "ND-7712", 90, 12, 470, 52, 34, 0, 11.75, 0, "PAID", ""],
  ["2026-08-05", "Newark", "NJ", "Baltimore", "MD", "Chesapeake Load Solutions", "CLS-40233", 190, 48, 745, 108, 41, 0, 18.62, 15, "PAID", "Lumper fee at delivery, reimbursed on invoice."],
  ["2026-08-06", "Baltimore", "MD", "Winchester", "VA", "Potomac Freight Exchange", "PFX-8890", 118, 78, 430, 92, 8, 0, 10.75, 0, "PAID", ""],
  ["2026-08-07", "Winchester", "VA", "Richmond", "VA", "Tidewater Brokerage Co.", "TB-1188", 165, 20, 640, 88, 0, 0, 16, 0, "PAID", ""],
  ["2026-08-10", "Richmond", "VA", "Baltimore", "MD", "Chesapeake Load Solutions", "CLS-40318", 155, 24, 620, 84, 12, 31, 15.50, 0, "PAID", ""],
  ["2026-08-11", "Baltimore", "MD", "Harrisburg", "PA", "Keystone Freight Partners", "KF-24902", 82, 96, 275, 92, 6, 13.75, 6.88, 0, "PAID", ""],
  ["2026-08-12", "Harrisburg", "PA", "Newark", "NJ", "Summit Line Brokerage", "SL-3376", 165, 18, 690, 92, 38, 34.50, 17.25, 0, "INVOICED", "Detention claim submitted, 1.5 hrs."],
  ["2026-08-14", "Newark", "NJ", "Herndon", "VA", "Ironbridge Transport Services", "IB-5520", 235, 120, 880, 168, 44, 44, 22, 0, "PAID", "Long deadhead back into home market."],
  ["2026-08-17", "Herndon", "VA", "Frederick", "MD", "Potomac Freight Exchange", "PFX-9041", 48, 10, 295, 28, 0, 14.75, 7.38, 0, "PAID", "Short local run, quick turn."],
  ["2026-08-18", "Frederick", "MD", "Philadelphia", "PA", "Keystone Freight Partners", "KF-25044", 148, 32, 615, 82, 22, 30.75, 15.38, 0, "PAID", ""],
  ["2026-08-19", "Philadelphia", "PA", "Newark", "NJ", "Northline Dispatch Group", "ND-7840", 90, 85, 285, 78, 34, 14.25, 7.12, 0, "PAID", ""],
  ["2026-08-20", "Newark", "NJ", "Baltimore", "MD", "Chesapeake Load Solutions", "CLS-40471", 190, 45, 760, 106, 41, 38, 19, 0, "INVOICED", ""],
  ["2026-08-21", "Baltimore", "MD", "Manassas", "VA", "Tidewater Brokerage Co.", "TB-1264", 78, 62, 300, 68, 6, 15, 7.50, 0, "PAID", ""],
  ["2026-08-24", "Manassas", "VA", "Richmond", "VA", "Potomac Freight Exchange", "PFX-9155", 92, 70, 335, 82, 0, 16.75, 8.38, 0, "INVOICED", ""],
  ["2026-08-25", "Richmond", "VA", "Harrisburg", "PA", "Summit Line Brokerage", "SL-3452", 245, 48, 935, 134, 26, 46.75, 23.38, 0, "INVOICED", "Best paying lane of the month."],
  ["2026-08-27", "Harrisburg", "PA", "Sterling", "VA", "Ironbridge Transport Services", "IB-5688", 128, 85, 500, 108, 14, 25, 12.50, 0, "PENDING", ""],
  ["2026-08-28", "Sterling", "VA", "Winchester", "VA", "Keystone Freight Partners", "KF-25130", 55, 8, 300, 30, 0, 15, 7.50, 0, "PENDING", "Rate con signed, not yet invoiced."],
];

type ExpenseSeed = [
  date: string,
  category: ExpenseCategoryId,
  description: string,
  vendor: string,
  amount: number,
  recurring: boolean,
  notes: string,
];

const AUGUST_EXPENSES: ExpenseSeed[] = [
  ["2026-08-01", "TRUCK_PAYMENT", "Truck note - August", "Meridian Equipment Finance", 1285, true, ""],
  ["2026-08-01", "INSURANCE", "Commercial auto + cargo premium", "Beacon Commercial Insurance", 685, true, ""],
  ["2026-08-01", "PARKING", "Monthly yard parking", "Sterling Truck Yard", 225, true, ""],
  ["2026-08-02", "ELD", "ELD subscription", "RouteLink ELD", 39, true, ""],
  ["2026-08-02", "PHONE", "Business line", "Cellwave Mobile", 95, true, ""],
  ["2026-08-05", "TOLLS", "E-ZPass replenishment - I-95 corridor", "E-ZPass", 140, false, ""],
  ["2026-08-08", "MAINTENANCE", "Air filter + chassis lube", "Herndon Diesel Service", 289.45, false, ""],
  ["2026-08-17", "DISPATCH", "Dispatch fee - week of Aug 10 (5%)", "Northline Dispatch Group", 123.25, false, ""],
  ["2026-08-13", "TOLLS", "E-ZPass replenishment", "E-ZPass", 120, false, ""],
  ["2026-08-15", "ACCOUNTING", "Monthly bookkeeping", "Ledgerline Bookkeeping", 250, true, ""],
  ["2026-08-15", "FACTORING", "Factoring fee - invoice batch 08A (2.5%)", "Cardinal Freight Factoring", 136.75, false, ""],
  ["2026-08-18", "REPAIRS", "Rear roll-door roller + seal replacement", "Winchester Fleet Repair", 412.8, false, "Door was binding in the track."],
  ["2026-08-24", "DISPATCH", "Dispatch fee - week of Aug 17 (5%)", "Northline Dispatch Group", 112.75, false, ""],
  ["2026-08-20", "OFFICE", "Load straps, moving blankets, supplies", "Freight Supply Depot", 148.32, false, ""],
  ["2026-08-22", "MAINTENANCE", "Tire rotation + balance", "Frederick Truck Center", 195, false, ""],
  ["2026-08-24", "TOLLS", "E-ZPass replenishment", "E-ZPass", 110, false, ""],
  ["2026-08-26", "PERMITS", "MD/PA temporary permit renewal", "State DOT", 78, false, ""],
  ["2026-08-31", "DISPATCH", "Dispatch fee - week of Aug 24 (5%)", "Northline Dispatch Group", 103.5, false, ""],
  ["2026-08-29", "FACTORING", "Factoring fee - invoice batch 08B (2.5%)", "Cardinal Freight Factoring", 108.14, false, ""],
  ["2026-08-30", "REGISTRATION", "IRP apportioned plate installment", "VA DMV", 165, false, ""],
];

type FuelSeed = [
  date: string,
  gallons: number,
  pricePerGallon: number,
  odometer: number,
  location: string,
];

const AUGUST_FUEL: FuelSeed[] = [
  ["2026-08-03", 42.6, 3.899, 141980, "Sterling, VA"],
  ["2026-08-05", 44.1, 4.129, 142368, "Newark, NJ"],
  ["2026-08-08", 40.8, 3.849, 142730, "Baltimore, MD"],
  ["2026-08-12", 45.2, 3.959, 143132, "Harrisburg, PA"],
  ["2026-08-17", 38.9, 3.829, 143468, "Frederick, MD"],
  ["2026-08-20", 43.7, 4.099, 143860, "Newark, NJ"],
  ["2026-08-25", 41.5, 3.789, 144225, "Richmond, VA"],
  ["2026-08-28", 39.4, 3.869, 144575, "Winchester, VA"],
];


/* ---- Maintenance service log ---------------------------------------- */

type MaintenanceSeed = [
  type: MaintenanceRecord["type"],
  basis: MaintenanceRecord["basis"],
  serviceDate: string,
  odometer: number | null,
  cost: number,
  vendor: string,
  nextServiceDate: string | null,
  nextServiceOdometer: number | null,
  notes: string,
];

/**
 * A realistic service history for a truck at ~144,780 miles on 2026-08-29:
 * one item overdue, three approaching, the rest comfortably ahead.
 */
const MAINTENANCE: MaintenanceSeed[] = [
  ["OIL_CHANGE", "BOTH", "2026-05-22", 136030, 312.4, "Herndon Diesel Service", "2026-11-22", 146030, "10,000 mile interval on city duty cycle."],
  ["DOT_INSPECTION", "DATE", "2025-09-21", 121450, 185, "Frederick Truck Center", "2026-09-21", null, "Annual federal inspection."],
  ["INSURANCE", "DATE", "2025-10-10", null, 0, "Beacon Commercial Insurance", "2026-10-10", null, "Premium billed monthly at $685 - see Expenses."],
  ["COOLANT", "BOTH", "2024-07-10", 96200, 268.5, "Herndon Diesel Service", "2026-07-10", 146200, "Extended life coolant, 2 year service."],
  ["FUEL_FILTER", "MILEAGE", "2026-06-18", 137900, 148.6, "Herndon Diesel Service", null, 167900, ""],
  ["TIRES", "MILEAGE", "2026-02-14", 124400, 2180, "Frederick Truck Center", null, 184400, "Six drive tires replaced."],
  ["BRAKES", "MILEAGE", "2025-11-08", 118900, 1460, "Winchester Fleet Repair", null, 168900, "Front and rear pads plus rotors."],
  ["STATE_INSPECTION", "DATE", "2026-03-02", 126800, 82, "Frederick Truck Center", "2027-03-02", null, ""],
  ["REGISTRATION", "DATE", "2026-01-15", null, 1980, "VA DMV", "2027-01-15", null, "IRP apportioned plate, billed in installments."],
];

/* ---- Deterministic history generator -------------------------------- */

/** mulberry32 -- small, fast, fully deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANES: [string, string, string, string, number][] = [
  ["Herndon", "VA", "Philadelphia", "PA", 175],
  ["Philadelphia", "PA", "Newark", "NJ", 90],
  ["Newark", "NJ", "Baltimore", "MD", 190],
  ["Baltimore", "MD", "Winchester", "VA", 118],
  ["Winchester", "VA", "Richmond", "VA", 165],
  ["Richmond", "VA", "Baltimore", "MD", 155],
  ["Baltimore", "MD", "Harrisburg", "PA", 82],
  ["Harrisburg", "PA", "Newark", "NJ", 165],
  ["Newark", "NJ", "Herndon", "VA", 235],
  ["Frederick", "MD", "Philadelphia", "PA", 148],
  ["Manassas", "VA", "Richmond", "VA", 92],
  ["Sterling", "VA", "Frederick", "MD", 45],
];

const BROKERS = [
  "Keystone Freight Partners",
  "Northline Dispatch Group",
  "Chesapeake Load Solutions",
  "Potomac Freight Exchange",
  "Tidewater Brokerage Co.",
  "Summit Line Brokerage",
  "Ironbridge Transport Services",
];

const FUEL_STOPS = [
  "Sterling, VA",
  "Newark, NJ",
  "Baltimore, MD",
  "Harrisburg, PA",
  "Frederick, MD",
  "Richmond, VA",
  "Winchester, VA",
];

interface GeneratedMonth {
  loads: Load[];
  expenses: Expense[];
  fuelEntries: FuelEntry[];
  endOdometer: number;
}

function generateMonth(
  year: number,
  monthIndex: number,
  seed: number,
  startOdometer: number,
): GeneratedMonth {
  const rand = rng(seed);
  const month = `${year}-${pad(monthIndex + 1)}`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const loads: Load[] = [];
  const expenses: Expense[] = [];
  const fuelEntries: FuelEntry[] = [];

  const loadCount = 15 + Math.floor(rand() * 4);
  let day = 1 + Math.floor(rand() * 2);

  for (let i = 0; i < loadCount && day <= lastDay; i += 1) {
    const lane = LANES[Math.floor(rand() * LANES.length)];
    const loadedMiles = lane[4] + Math.round((rand() - 0.5) * 16);
    const deadheadMiles = Math.round(loadedMiles * (0.08 + rand() * 0.18));
    const ratePerLoadedMile = 3.55 + rand() * 1.15;
    const grossRate = roundMoney(Math.round(loadedMiles * ratePerLoadedMile * 0.2) * 5);
    const date = `${month}-${pad(day)}`;
    const destinationMiles = Math.floor(loadedMiles / 2);
    const broker = BROKERS[Math.floor(rand() * BROKERS.length)];

    loads.push({
      id: `load_${month}_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      driverId: null,
      date,
      deliveryDate: date,
      endingOdometer: null,
      originCity: lane[0],
      originState: lane[1],
      destinationCity: lane[2],
      destinationState: lane[3],
      broker,
      loadNumber: `GEN-${month.replace("-", "")}${pad(i + 1)}`,
      equipmentType: "BOX_TRUCK",
      loadCapacity: "FULL",
      equipmentLengthFt: 26,
      weightLbs: 6_000 + Math.round(rand() * 6_000),
      commodity: "General freight",
      loadedMiles,
      deadheadMiles,
      grossRate,
      fuelCost: roundMoney((loadedMiles + deadheadMiles) * 0.44),
      tolls: rand() > 0.55 ? roundMoney(Math.round(rand() * 40)) : 0,
      dispatchFee: roundMoney(grossRate * 0.05),
      factoringFee: roundMoney(grossRate * 0.025),
      otherExpenses: rand() > 0.88 ? roundMoney(Math.round(rand() * 30)) : 0,
      driverPay: 0,
      costsPosted: false,
      status: "PAID",
      jurisdictionMiles: [
        {
          jurisdiction: lane[1],
          totalMiles: loadedMiles + deadheadMiles - destinationMiles,
          nonTaxableMiles: 0,
        },
        { jurisdiction: lane[3], totalMiles: destinationMiles, nonTaxableMiles: 0 },
      ],
      invoiceNumber: `INV-${date.replaceAll("-", "")}-${pad(i + 1)}`,
      invoiceDate: date,
      invoiceDueDate: date,
      invoicePaidDate: date,
      billToName: broker,
      billToEmail: null,
      billToAddress: null,
      invoiceNotes: null,
      notes: null,
      createdAt: `${date}T18:00:00.000Z`,
    });

    day += 1 + Math.floor(rand() * 3);
  }

  const totalMiles = loads.reduce((t, l) => t + l.loadedMiles + l.deadheadMiles, 0);
  const grossRevenue = loads.reduce((t, l) => t + l.grossRate, 0);

  const fixed: [ExpenseCategoryId, string, string, number][] = [
    ["TRUCK_PAYMENT", "Truck note", "Meridian Equipment Finance", 1285],
    ["INSURANCE", "Commercial auto + cargo premium", "Beacon Commercial Insurance", 685],
    ["PARKING", "Monthly yard parking", "Sterling Truck Yard", 225],
    ["ELD", "ELD subscription", "RouteLink ELD", 39],
    ["PHONE", "Business line", "Cellwave Mobile", 95],
    ["ACCOUNTING", "Monthly bookkeeping", "Ledgerline Bookkeeping", 250],
  ];

  fixed.forEach(([category, description, vendor, amount], i) => {
    const date = `${month}-${pad(i < 3 ? 1 : i < 5 ? 2 : 15)}`;
    expenses.push({
      id: `exp_${month}_fx${i}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      scope: "TRUCK",
      loadId: null,
      date,
      category,
      description,
      vendor,
      amount,
      recurring: true,
      receiptNumber: null,
      notes: null,
      createdAt: `${date}T09:00:00.000Z`,
    });
  });

  const variable: [ExpenseCategoryId, string, string, number, number][] = [
    ["TOLLS", "E-ZPass replenishment", "E-ZPass", 8, 110],
    ["MAINTENANCE", "Scheduled service", "Herndon Diesel Service", 14, 240],
    ["DISPATCH", "Dispatch fee", "Northline Dispatch Group", 19, roundMoney(grossRevenue * 0.014)],
    ["FACTORING", "Factoring fee", "Cardinal Freight Factoring", 22, roundMoney(grossRevenue * 0.013)],
    ["OFFICE", "Supplies", "Freight Supply Depot", 25, 96],
  ];

  variable.forEach(([category, description, vendor, dayOfMonth, base], i) => {
    const amount = roundMoney(base * (0.85 + rand() * 0.35));
    const date = `${month}-${pad(Math.min(dayOfMonth, lastDay))}`;
    expenses.push({
      id: `exp_${month}_vr${i}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      scope: "TRUCK",
      loadId: null,
      date,
      category,
      description,
      vendor,
      amount,
      recurring: false,
      receiptNumber: null,
      notes: null,
      createdAt: `${date}T09:00:00.000Z`,
    });
  });

  if (rand() > 0.45) {
    const date = `${month}-${pad(Math.min(18, lastDay))}`;
    expenses.push({
      id: `exp_${month}_rp`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      scope: "TRUCK",
      loadId: null,
      date,
      category: "REPAIRS",
      description: "Unscheduled repair",
      vendor: "Winchester Fleet Repair",
      amount: roundMoney(180 + rand() * 520),
      recurring: false,
      receiptNumber: null,
      notes: null,
      createdAt: `${date}T09:00:00.000Z`,
    });
  }

  // Fuel: ~8.8 MPG across the month, spread over 7-8 fill ups.
  const fills = 7 + Math.round(rand());
  const gallonsTotal = totalMiles / 8.8;
  let odometer = startOdometer;
  for (let i = 0; i < fills; i += 1) {
    const gallons = Math.round((gallonsTotal / fills) * (0.9 + rand() * 0.2) * 10) / 10;
    const pricePerGallon = Math.round((3.72 + rand() * 0.45) * 1000) / 1000;
    const dayOfMonth = Math.min(lastDay, 2 + Math.round((i * (lastDay - 4)) / fills));
    const date = `${month}-${pad(dayOfMonth)}`;
    odometer += Math.round(totalMiles / fills);
    const totalCost = roundMoney(gallons * pricePerGallon);

    const location = FUEL_STOPS[Math.floor(rand() * FUEL_STOPS.length)];
    fuelEntries.push({
      id: `fuel_${month}_${pad(i + 1)}`,
      expenseId: `expfuel_fuel_${month}_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      loadId: null,
      date,
      gallons,
      pricePerGallon,
      totalCost,
      odometer,
      location,
      jurisdiction: inferFuelJurisdiction(location),
      notes: null,
      createdAt: `${date}T12:00:00.000Z`,
    });

    expenses.push({
      id: `expfuel_fuel_${month}_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      scope: "TRUCK",
      loadId: null,
      date,
      category: "FUEL",
      description: `Fuel - ${gallons.toFixed(1)} gal`,
      vendor: "Fuel stop",
      amount: totalCost,
      recurring: false,
      receiptNumber: null,
      notes: null,
      createdAt: `${date}T12:00:00.000Z`,
    });
  }

  return { loads, expenses, fuelEntries, endOdometer: odometer };
}

/* ---- Assembly -------------------------------------------------------- */

export function buildSeedDataset(): Dataset {
  const loads: Load[] = [];
  const expenses: Expense[] = [];
  const fuelEntries: FuelEntry[] = [];

  // Three months of history leading into August.
  let odometer = 133400;
  const history = [
    { year: 2026, monthIndex: 4, seed: 20260501 },
    { year: 2026, monthIndex: 5, seed: 20260601 },
    { year: 2026, monthIndex: 6, seed: 20260701 },
  ];
  for (const h of history) {
    const generated = generateMonth(h.year, h.monthIndex, h.seed, odometer);
    loads.push(...generated.loads);
    expenses.push(...generated.expenses);
    fuelEntries.push(...generated.fuelEntries);
    odometer = generated.endOdometer;
  }

  AUGUST_LOADS.forEach((row, i) => {
    const [
      date,
      originCity,
      originState,
      destinationCity,
      destinationState,
      broker,
      loadNumber,
      loadedMiles,
      deadheadMiles,
      grossRate,
      fuelCost,
      tolls,
      dispatchFee,
      factoringFee,
      otherExpenses,
      status,
      notes,
    ] = row;

    const destinationMiles = Math.floor(loadedMiles / 2);
    const invoiceNumber = status === "PENDING" ? null : `INV-${date.replaceAll("-", "")}-${pad(i + 1)}`;
    loads.push({
      id: `load_aug_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      driverId: null,
      date,
      deliveryDate: date,
      endingOdometer: null,
      originCity,
      originState,
      destinationCity,
      destinationState,
      broker,
      loadNumber,
      equipmentType: "BOX_TRUCK",
      loadCapacity: "FULL",
      equipmentLengthFt: 26,
      weightLbs: 8_000,
      commodity: "General freight",
      loadedMiles,
      deadheadMiles,
      grossRate,
      fuelCost,
      tolls,
      dispatchFee,
      factoringFee,
      otherExpenses,
      driverPay: 0,
      costsPosted: false,
      status,
      jurisdictionMiles: [
        {
          jurisdiction: originState,
          totalMiles: loadedMiles + deadheadMiles - destinationMiles,
          nonTaxableMiles: 0,
        },
        { jurisdiction: destinationState, totalMiles: destinationMiles, nonTaxableMiles: 0 },
      ],
      invoiceNumber,
      invoiceDate: invoiceNumber ? date : null,
      invoiceDueDate: invoiceNumber ? date : null,
      invoicePaidDate: status === "PAID" ? date : null,
      billToName: invoiceNumber ? broker : null,
      billToEmail: null,
      billToAddress: null,
      invoiceNotes: null,
      notes: notes || null,
      createdAt: `${date}T18:00:00.000Z`,
    });
  });

  AUGUST_EXPENSES.forEach((row, i) => {
    const [date, category, description, vendor, amount, recurring, notes] = row;
    expenses.push({
      id: `exp_aug_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      scope: "TRUCK",
      loadId: null,
      date,
      category,
      description,
      vendor,
      amount,
      recurring,
      receiptNumber: null,
      notes: notes || null,
      createdAt: `${date}T09:00:00.000Z`,
    });
  });

  AUGUST_FUEL.forEach((row, i) => {
    const [date, gallons, pricePerGallon, odo, location] = row;
    const totalCost = roundMoney(gallons * pricePerGallon);

    fuelEntries.push({
      id: `fuel_aug_${pad(i + 1)}`,
      expenseId: `expfuel_fuel_aug_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      loadId: null,
      date,
      gallons,
      pricePerGallon,
      totalCost,
      odometer: odo,
      location,
      jurisdiction: inferFuelJurisdiction(location),
      notes: null,
      createdAt: `${date}T12:00:00.000Z`,
    });

    // Every fill-up is also a FUEL row in the expense ledger. The ledger is
    // the single source of truth for operating expenses -- the fuel page is
    // an operational view over the same money.
    expenses.push({
      id: `expfuel_fuel_aug_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      scope: "TRUCK",
      loadId: null,
      date,
      category: "FUEL",
      description: `Fuel - ${gallons.toFixed(1)} gal @ ${pricePerGallon.toFixed(3)}/gal`,
      vendor: location,
      amount: totalCost,
      recurring: false,
      receiptNumber: null,
      notes: null,
      createdAt: `${date}T12:00:00.000Z`,
    });
  });

  const maintenanceRecords: MaintenanceRecord[] = MAINTENANCE.map((row, i) => {
    const [
      type,
      basis,
      serviceDate,
      odometer,
      cost,
      vendor,
      nextServiceDate,
      nextServiceOdometer,
      notes,
    ] = row;

    return {
      id: `maint_${pad(i + 1)}`,
      businessId: BUSINESS_ID,
      truckId: TRUCK_ID,
      type,
      basis,
      serviceDate,
      odometer,
      cost,
      vendor,
      nextServiceDate,
      nextServiceOdometer,
      // These services predate the expense ledger window, so they are logged
      // as history only and are not double counted as period spend.
      expenseId: null,
      notes: notes || null,
      createdAt: `${serviceDate}T10:00:00.000Z`,
    } satisfies MaintenanceRecord;
  });

  const byDateDesc = <T extends { date: string; id: string }>(a: T, b: T) =>
    b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

  const sortedLoads = loads.sort(byDateDesc);
  const sortedExpenses = expenses.sort(byDateDesc);

  // Reserve buckets: the two built-ins plus an emergency fund, so the bucket
  // UI is exercised with a bucket that carries its own contribution rate.
  const reserveAccounts: ReserveAccount[] = [
    ...defaultReserveAccounts(BUSINESS_ID, CREATED),
    {
      id: "res_emergency",
      businessId: BUSINESS_ID,
      kind: "EMERGENCY",
      name: "Emergency Fund",
      basis: "GROSS_REVENUE",
      contributionPct: 2,
      targetBalance: 5000,
      active: true,
      sortOrder: 2,
      createdAt: CREATED,
    },
  ];

  // Every half-month from May through July is closed, so the app opens with
  // real settlement history and reserve balances that were actually accrued
  // rather than typed in. August is left open -- it is the live period.
  const settlements: Settlement[] = [];
  const reserveTransactions: ReserveTransaction[] = [];
  const closedWindows: { month: string; half: SettlementHalf }[] = [
    { month: "2026-05", half: "FIRST" },
    { month: "2026-05", half: "SECOND" },
    { month: "2026-06", half: "FIRST" },
    { month: "2026-06", half: "SECOND" },
    { month: "2026-07", half: "FIRST" },
    { month: "2026-07", half: "SECOND" },
  ];
  for (const window of closedWindows) {
    const bounds = settlementBounds(window.month, window.half);
    const snapshot = buildSettlementSnapshot(
      sortedLoads,
      sortedExpenses,
      bounds,
      FIXTURE_SETTINGS,
      reserveAccounts,
    );
    const id = settlementId(window.month, window.half);

    settlements.push({
      id,
      businessId: BUSINESS_ID,
      month: window.month,
      half: window.half,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      status: "CLOSED",
      closedAt: `${bounds.end}T21:00:00.000Z`,
      snapshot,
      notes: null,
      createdAt: `${bounds.start}T08:00:00.000Z`,
    });

    for (const reserve of snapshot.reserves) {
      if (reserve.amount <= 0) continue;
      reserveTransactions.push({
        id: `rtx_${id}_${reserve.accountId}`,
        businessId: BUSINESS_ID,
        accountId: reserve.accountId,
        date: bounds.end,
        type: "CONTRIBUTION",
        amount: reserve.amount,
        description: `${reserve.pct}% ${reserve.basis === "OPERATING_PROFIT" ? "of Operating Profit" : "of Booked Revenue"} - settlement closed`,
        settlementId: id,
        createdAt: `${bounds.end}T21:00:00.000Z`,
      });
    }
  }

  // One manual withdrawal, so the ledger shows money leaving a bucket as well
  // as arriving: the July brake job was paid out of the maintenance reserve.
  reserveTransactions.push({
    id: "rtx_manual_brakes",
    businessId: BUSINESS_ID,
    accountId: "res_maintenance",
    date: "2026-07-18",
    type: "WITHDRAWAL",
    amount: -640,
    description: "Front brake service paid from reserve",
    settlementId: null,
    createdAt: "2026-07-18T15:00:00.000Z",
  });

  const bySettlementDateDesc = <T extends { date: string; id: string }>(a: T, b: T) =>
    b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

  return {
    business: FIXTURE_BUSINESS,
    settings: FIXTURE_SETTINGS,
    goals: defaultGoals(BUSINESS_ID, CREATED),
    subscription: defaultSubscription(BUSINESS_ID, CREATED),
    trucks: [FIXTURE_TRUCK],
    loads: sortedLoads,
    expenses: sortedExpenses,
    financialObligations: [],
    paymentEvents: [],
    fuelEntries: fuelEntries.sort(byDateDesc),
    // No user is present: this object is a test fixture, never an account.
    users: [],
    documents: [] as Document[],
    maintenanceRecords: maintenanceRecords.sort((a, b) =>
      b.serviceDate.localeCompare(a.serviceDate),
    ),
    reserveAccounts,
    reserveTransactions: reserveTransactions.sort(bySettlementDateDesc),
    settlements: settlements.sort(
      (a, b) => b.periodStart.localeCompare(a.periodStart) || b.id.localeCompare(a.id),
    ),
    drivers: [],
    driverSettlements: [],
  };
}
