export type AppLocale = "en" | "es";

export const APP_LOCALES: ReadonlyArray<{
  id: AppLocale;
  label: string;
  shortLabel: string;
}> = [
  { id: "en", label: "English", shortLabel: "EN" },
  { id: "es", label: "Español", shortLabel: "ES" },
];

export const APP_LOCALE_COOKIE = "onroadbooks.locale";

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "es";
}

const SHELL_COPY_EN = {
  displaySettings: "Display settings",
  displayTitle: "Theme, text size, and language",
  theme: "Theme",
  dark: "Dark",
  light: "Light",
  textSize: "Text size",
  language: "Language",
  operate: "Operate",
  money: "Money",
  intelligence: "Intelligence",
  system: "System",
  dashboard: "Dashboard",
  loads: "Loads",
  loadCalculator: "Load Calculator",
  expenses: "Expenses",
  fuel: "Fuel",
  drivers: "Drivers",
  financing: "Financing",
  invoices: "Invoices",
  ownerSettlements: "Owner Settlements",
  driverPay: "Driver Pay",
  reserves: "Reserves",
  ifta: "IFTA",
  analytics: "Analytics",
  reports: "Reports",
  fleet: "Fleet",
  truck: "Truck",
  admin: "Admin",
  businessSettings: "Business Settings",
  viewerAccess: "Viewer access",
  readOnly: "this workspace is read-only for your role.",
  signOut: "Sign out",
  navigation: "Navigation",
  openNavigation: "Open navigation",
  mainNavigation: "Main navigation",
} as const;

type LocalizedShape<T> = { readonly [K in keyof T]: string };
type ShellCopy = LocalizedShape<typeof SHELL_COPY_EN>;

export const SHELL_COPY: Record<AppLocale, ShellCopy> = {
  en: SHELL_COPY_EN,
  es: {
    displaySettings: "Preferencias de la aplicación",
    displayTitle: "Tema, tamaño de texto e idioma",
    theme: "Tema",
    dark: "Oscuro",
    light: "Claro",
    textSize: "Tamaño de texto",
    language: "Idioma",
    operate: "Operación",
    money: "Dinero",
    intelligence: "Análisis",
    system: "Sistema",
    dashboard: "Resumen",
    loads: "Cargas",
    loadCalculator: "Calculadora de cargas",
    expenses: "Gastos",
    fuel: "Combustible",
    drivers: "Choferes",
    financing: "Financiamiento",
    invoices: "Facturas",
    ownerSettlements: "Liquidaciones del dueño",
    driverPay: "Pago a choferes",
    reserves: "Reservas",
    ifta: "IFTA",
    analytics: "Analítica",
    reports: "Reportes",
    fleet: "Flota",
    truck: "Camión",
    admin: "Administración",
    businessSettings: "Configuración del negocio",
    viewerAccess: "Acceso de solo lectura",
    readOnly: "este espacio de trabajo es de solo lectura para tu rol.",
    signOut: "Cerrar sesión",
    navigation: "Navegación",
    openNavigation: "Abrir navegación",
    mainNavigation: "Navegación principal",
  },
} as const;
