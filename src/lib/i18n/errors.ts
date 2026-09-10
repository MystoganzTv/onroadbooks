import { APP_LOCALE_COOKIE, type AppLocale } from "@/lib/i18n";

const en = {
  generic: "We could not complete that action. Try again.",
  highlighted: "Check the highlighted fields.",
  cityState: "Review the highlighted city and state.",
  loadMissing: "Load not found.",
  invoiceDuplicate: "That invoice number is already in use.",
  invoiceFirst: "Issue the invoice before marking it paid.",
  paymentDate: "Use a valid payment date.",
  invoicePaid: "That invoice is already fully paid.",
  invoiceVoid: "An invoice with recorded payments cannot be voided.",
  role: "Choose a valid role.",
  memberMissing: "That team member was not found.",
  ownerAlready: "You are already the workspace owner.",
  quarterRates: "Check the quarter and tax rates.",
  paymentDateChoice: "Choose a valid payment date.",
  settlementPeriod: "That settlement period is not valid.",
  settlementOpen: "This settlement period has not finished yet. It can be closed once it ends.",
  settlementClosed: "That settlement is already closed.",
  truckRetire: "That is not a truck we can retire.",
  monthPrepare: "That month could not be prepared.",
  resetConfirm: "Type RESET to confirm.",
  emailConfirm: "Type your email address exactly to confirm.",
  readonly: "This workspace is read-only until billing is active.",
  mirrorFuel: "This row comes from a fuel entry. Change it on the Fuel page and the ledger follows.",
  mirrorService:
    "This row comes from a service record. Change it in the truck's service history and the ledger follows.",
  mirrorLoad: "This row comes from a load's trip costs. Change it on that load and the ledger follows.",
  scanUnavailable: "Rate confirmation scanning is not set up on this deployment.",
  scanRole: "Your role cannot add loads.",
  scanNoFile: "Choose a rate confirmation to scan.",
  scanFileType: "Scanning works on a PDF or a photo (PNG, JPEG or WebP).",
  scanTooLarge: "That file is too large to scan. Try a smaller PDF or photo.",
  scanBusy: "That is a lot of scans in one hour. Try again shortly.",
  scanUnreadable: "We could not find a rate confirmation in that file. Check the file and try again.",
  scanFailed: "The rate confirmation could not be read right now. Try again in a moment.",
} as const;

const es: { [K in keyof typeof en]: string } = {
  generic: "No pudimos completar esa acción. Inténtalo otra vez.",
  highlighted: "Revisa los campos señalados.",
  cityState: "Revisa la ciudad y el estado señalados.",
  loadMissing: "No se encontró la carga.",
  invoiceDuplicate: "Ese número de factura ya está en uso.",
  invoiceFirst: "Emite la factura antes de marcarla como pagada.",
  paymentDate: "Usa una fecha de pago válida.",
  invoicePaid: "Esa factura ya está pagada por completo.",
  invoiceVoid: "No se puede anular una factura con pagos registrados.",
  role: "Elige un rol válido.",
  memberMissing: "No se encontró a ese miembro del equipo.",
  ownerAlready: "Ya eres el dueño del espacio.",
  quarterRates: "Revisa el trimestre y las tarifas de impuesto.",
  paymentDateChoice: "Elige una fecha de pago válida.",
  settlementPeriod: "Ese período de liquidación no es válido.",
  settlementOpen: "Ese período aún no termina. Podrás cerrarlo cuando finalice.",
  settlementClosed: "Esa liquidación ya está cerrada.",
  truckRetire: "Ese camión no se puede retirar.",
  monthPrepare: "No se pudo preparar ese mes.",
  resetConfirm: "Escribe RESET para confirmar.",
  emailConfirm: "Escribe tu correo exactamente para confirmar.",
  readonly: "Este espacio es de solo lectura hasta que la facturación esté activa.",
  mirrorFuel: "Esta fila viene de una carga de diésel. Cámbiala en Combustible y el libro se actualiza solo.",
  mirrorService:
    "Esta fila viene de un registro de servicio. Cámbiala en el historial de servicio del camión y el libro se actualiza solo.",
  mirrorLoad: "Esta fila viene de los costos de viaje de una carga. Cámbiala en esa carga y el libro se actualiza solo.",
  scanUnavailable: "El escaneo de confirmaciones de tarifa no está configurado en este despliegue.",
  scanRole: "Tu rol no puede agregar cargas.",
  scanNoFile: "Elige una confirmación de tarifa para escanear.",
  scanFileType: "El escaneo funciona con un PDF o una foto (PNG, JPEG o WebP).",
  scanTooLarge: "Ese archivo es demasiado grande para escanearlo. Prueba con un PDF o una foto más pequeños.",
  scanBusy: "Son muchos escaneos en una hora. Inténtalo un poco más tarde.",
  scanUnreadable: "No encontramos una confirmación de tarifa en ese archivo. Revísalo e inténtalo otra vez.",
  scanFailed: "No se pudo leer la confirmación de tarifa ahora mismo. Inténtalo en un momento.",
};

const englishToKey = new Map<string, keyof typeof en>(
  Object.entries(en).filter(([key]) => key !== "generic").map(([key, value]) => [value, key as keyof typeof en]),
);

export function localizeError(message: string | null | undefined, locale: AppLocale): string {
  if (!message) return locale === "es" ? es.generic : en.generic;
  if (locale === "en") return message;
  const key = englishToKey.get(message);
  if (key) return es[key];
  if (/^Bringing that truck back would put you over your plan's limit of \d+\.$/.test(message)) {
    const limit = message.match(/\d+/)?.[0] ?? "0";
    return `Devolver ese camión al servicio superaría el límite de ${limit} de tu plan.`;
  }
  if (/^Type RESET .+ to confirm\.$/.test(message)) {
    return message.replace(/^Type /, "Escribe ").replace(/ to confirm\.$/, " para confirmar.");
  }
  return es.generic;
}

/** Client-safe adapter for action/API errors. It never exposes an English fallback in Spanish. */
export function localizedClientError(message: string | null | undefined): string {
  if (typeof document === "undefined") return localizeError(message, "en");
  const locale = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${APP_LOCALE_COOKIE}=`))
    ?.split("=")[1];
  return localizeError(message, locale === "es" ? "es" : "en");
}
