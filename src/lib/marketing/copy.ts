/**
 * LANDING COPY
 * ============
 *
 * Every claim on the marketing page is a claim about something the app
 * actually does today. Where a capability is not shipped yet it is labelled
 * early access rather than described in the present tense -- a landing page
 * that oversells is a support ticket with a delay on it.
 *
 * The product preview figures are the seeded demo month, which is also the
 * first month a new owner sees, so the picture on the landing page and the
 * picture inside the product are the same picture.
 *
 * English is the source of truth: `LandingCopy` is derived from it, so the
 * Spanish object cannot drift out of shape without failing the type check.
 * The demo figures live in `PREVIEW_FIGURES` because numbers do not translate.
 */

export type Lang = "en" | "es";

/**
 * The figures in the marketing mock-ups. These are the seeded demo month
 * (`?month=2026-08&period=full`) and they tie to the cent:
 *
 *   revenue 9,795.00 - expenses 6,143.90            = net 3,651.10
 *   tax 20% of profit 730.22, maintenance 5% of
 *   revenue 489.75, emergency 2% of revenue 195.90  = reserves 1,415.87
 *   3,651.10 - 1,415.87                             = safe to pay 2,235.23
 *
 * If a change to the seed or to the maths moves these, the landing page is
 * wrong and has to move with them.
 */
export const PREVIEW_FIGURES = {
  revenue: "$9,795",
  expenses: "$6,144",
  netProfit: "$3,651",
  margin: "37.3%",
  available: "$2,235",
  costPerMile: "$1.84",
  revenuePerMile: "$2.94",
  profitPerMile: "$1.10",
  taxReserve: "-$730",
  maintenanceReserve: "-$490",
  emergencyReserve: "-$196",
  loadRate: "$2,450",
  loadMiles: "612",
  loadDeadhead: "88",
  loadProfit: "$881",
  loadPerMile: "$1.26",
  loadScore: "82",
  /** August expenses by group. Percentages are of $6,143.90 and sum to 100. */
  expenseSlices: [
    { key: "fuel", amount: "$1,322", pct: 21.5 },
    { key: "note", amount: "$1,285", pct: 20.9 },
    { key: "fees", amount: "$954", pct: 15.5 },
    { key: "service", amount: "$897", pct: 14.6 },
    { key: "insurance", amount: "$685", pct: 11.1 },
    { key: "other", amount: "$1,000", pct: 16.4 },
  ],
} as const;

const en = {
  meta: {
    title: "OnRoad Books - Know what your truck really makes.",
    description:
      "Bookkeeping and profit tracking for owner-operators. True cost per mile, load screening before you book, owner pay after reserves, and broker and lane scoring - all from your own ledger.",
  },
  banner: {
    text: "Half-month settlements and reserve buckets are live. Free for 7 days, no card.",
  },
  nav: {
    links: [
      { href: "#features", label: "Features" },
      { href: "#how", label: "How it works" },
      { href: "#pricing", label: "Pricing" },
      { href: "#faq", label: "FAQ" },
    ],
    signIn: "Log In",
    cta: "Start Free Trial",
    /** The header CTA on a 320px phone, where the full label does not fit. */
    ctaShort: "Start free",
    langLabel: "Language",
    menuLabel: "Menu",
  },
  hero: {
    titleTop: "Know what",
    titleMid: "your truck",
    titleAccent: "really makes.",
    sub: "Bookkeeping and profit tracking for owner-operators, running on your own loads, fuel and receipts.",
    points: [
      {
        title: "Track Every Dollar",
        body: "Loads, expenses, fuel, tolls and receipts.",
      },
      {
        title: "Know Your Numbers",
        body: "Real profit, cost per mile and per-load profitability.",
      },
      {
        title: "Set Money Aside",
        body: "Tax and maintenance reserved every time you close.",
      },
    ],
    cta: "Start Free Trial",
    secondary: "See How It Works",
    checks: ["No credit card required", "Cancel anytime", "Built for owner-operators"],
  },
  preview: {
    url: "app.onroadbooks.com/dashboard",
    nav: [
      "Dashboard",
      "Loads",
      "Expenses",
      "Fuel",
      "Truck",
      "Settlements",
      "Reserves",
      "Analytics",
      "Reports",
    ],
    settings: "Settings",
    title: "Dashboard",
    period: "Aug 1 - Aug 31, 2026",
    tiles: {
      revenue: "Gross Revenue",
      netProfit: "Net Profit",
      profitPerMile: "Profit / Mile",
      marginNote: "margin",
      cpmNote: "true cost / mile $1.84",
      expensesNote: "expenses",
    },
    chart: {
      title: "Revenue vs Expenses",
      revenue: "Revenue",
      expenses: "Expenses",
      ticks: ["Aug 1", "Aug 8", "Aug 15", "Aug 22", "Aug 29"],
    },
    breakdown: {
      title: "Money Breakdown",
      operatingProfit: "Operating profit",
      taxReserve: "Tax reserve (20% of profit)",
      maintenanceReserve: "Maintenance (5% of revenue)",
      emergencyReserve: "Emergency fund (2% of revenue)",
      available: "Safe to pay yourself",
    },
    phone: {
      back: "Load details",
      route: "Norfolk, VA",
      routeTo: "Newark, NJ",
      milesNote: "612 loaded - 88 deadhead",
      rate: "Rate",
      profit: "Trip profit",
      perMile: "Per total mile",
      verdict: "GREAT LOAD",
      score: "Score 82 / 100",
    },
    expensesPhone: {
      title: "Expenses",
      total: "Total",
      note: "August",
      labels: [
        "Fuel",
        "Truck payment",
        "Tolls & fees",
        "Maintenance & repairs",
        "Insurance",
        "Other",
      ],
    },
  },
  features: {
    title: "Everything you need to run a profitable trucking business.",
    items: [
      { title: "Track Loads", body: "Know which loads actually made money, and which only looked like it." },
      { title: "Manage Expenses", body: "Fuel, tolls, repairs, insurance, permits - with the receipt attached." },
      { title: "Real Profit Tracking", body: "Net profit and margin for any window, never prorated." },
      { title: "Reserve With Confidence", body: "Tax and maintenance funded every time you close a settlement." },
      { title: "Reports That Help", body: "Print-ready monthly reports and a clean CSV export of everything." },
      { title: "Cab Or Kitchen Table", body: "The same books on the phone in the truck and the laptop at home." },
    ],
  },
  how: {
    title: "It's not just\nabout making money.",
    titleAccent: "It's about keeping it.",
    body: "OnRoad Books helps you understand every mile, every expense, and every dollar—so you can make smarter decisions and build a stronger business on the road.",
    script: "Built for\nOwner-Operators",
    compareTitle: "Profit per mile",
    cards: [
      {
        title: "Most Truckers",
        note: "Don't track real costs",
        value: "$0.50",
        unit: "per mile",
      },
      {
        title: "OnRoad Books Users",
        note: "Track what matters",
        value: "$1.92",
        unit: "per mile",
      },
    ],
    vs: "VS",
    scriptTwo: "That's the difference\nsmart tracking makes.",
  },
  proof: {
    eyebrow: "Why it exists",
    title: "Gross is the one number the industry hands you for free.",
    body: "Every number that decides whether the truck is worth running you have to build yourself, and most owner-operators never get the time. That is the whole job of this app.",
    points: [
      "True cost per mile from your own ledger - never a national average",
      "A load priced before you book it, not explained after you unload",
      "Owner pay that already has the tax and the next set of tires taken out",
    ],
    imageAlt: "An owner-operator's truck on the highway",
  },
  cta: {
    title: "Ready to take control of your numbers?",
    checks: [
      "Start your 7-day free trial",
      "No credit card required",
      "No bank connection, ever",
      "Cancel anytime and export everything",
    ],
    button: "Start Free Trial",
  },
  trust: {
    line: "You drive. The books keep up.",
    items: [
      "Secure and private",
      "No bank connection",
      "Your data exports with you",
      "Built for one truck",
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Less than one bad load a year.",
    sub: "Every plan includes the full profit engine. Fourteen days free, no card up front.",
    per: "/month",
    plans: [
      {
        id: "SOLO",
        badge: "The book",
        featured: false,
        cta: "Start free trial",
        tagline: "One truck, and every number about the miles you already ran.",
        features: [
          "One truck, unlimited loads",
          "Loads, expenses, fuel, receipts and documents",
          "Profit per load and profit per mile",
          "True cost per mile, never prorated",
          "Print-ready reports and CSV export",
        ],
        note: null,
      },
      {
        id: "OWNER",
        badge: "Most popular",
        featured: true,
        cta: "Start free trial",
        tagline: "The decisions, not just the record.",
        features: [
          "Everything in Solo Starter",
          "Load calculator and target rate",
          "Broker and lane scorecards",
          "Deadhead priced at your own cost per mile",
          "1-15 and 16-end settlements, frozen when you close them",
          "Tax and maintenance reserves, and Safe to Pay Yourself",
          "Monthly goals, pace and projection",
        ],
        note: null,
      },
      {
        id: "FLEET",
        badge: "Separate paid service",
        featured: false,
        cta: "Request Fleet access",
        tagline: "Two to eight trucks, each with its own economics.",
        features: [
          "Everything in OnRoad Pro",
          "Up to eight trucks on one account",
          "Cost per mile and contribution per unit",
          "Business overhead kept separate from truck costs",
          "Fleet-wide settlements",
        ],
        note: "Fleet is activated separately from a one-truck account. Everything listed here works today; a second sign-in for a partner or bookkeeper does not exist yet.",
      },
    ],
  },
  faq: {
    title: "Common questions",
    items: [
      {
        q: "Do I have to connect my bank account?",
        a: "No, and there is nothing to connect. You enter loads, fuel and expenses - a load takes under a minute - and attach receipts if you want them on file. Nothing links to a bank, and nobody else sees your ledger.",
      },
      {
        q: "Is this going to replace my accountant?",
        a: "No, and it does not try to. Your accountant files the return; this tells you what a mile costs and what you can take out on the fifteenth. Everything exports cleanly when it is time to hand the year over.",
      },
      {
        q: "How long before the numbers mean anything?",
        a: "Cost per mile needs miles. Enter the last month or two of loads and fuel and the cockpit is live immediately; the calculator needs 500 miles of history before it will use a rolling 90-day basis, and it tells you which basis it is on.",
      },
      {
        q: "I run a box truck, a hotshot, a reefer. Does it care?",
        a: "It does not. The maths is rate, miles, deadhead and what the truck costs to run. Set your own rating thresholds and reserve percentages and the app works to your operation instead of a national average.",
      },
      {
        q: "What happens to my data if I stop paying?",
        a: "You keep reading and exporting it - loads, expenses, fuel, settlements, the lot - as CSV. Only writing closes. No hostage-taking and no export fee.",
      },
      {
        q: "Is the safe-to-pay number tax advice?",
        a: "No. It is a planning figure: your operating profit minus the reserve percentages you chose yourself. It is not a bank balance, and it is not tax or accounting advice.",
      },
    ],
  },
  footer: {
    tagline: "Bookkeeping built for the road.",
    links: [
      { href: "#features", label: "Features" },
      { href: "#how", label: "How it works" },
      { href: "#pricing", label: "Pricing" },
      { href: "#faq", label: "FAQ" },
    ],
    disclaimer:
      "OnRoad Books is a financial management tool for independent trucking businesses. It is not tax, accounting or legal advice, and the figures it produces are planning figures based on the data and the rates you enter.",
    rights: "All rights reserved.",
  },
};

export type LandingCopy = typeof en;

const es: LandingCopy = {
  meta: {
    title: "OnRoad Books - Sabe lo que de verdad deja tu camión.",
    description:
      "Contabilidad y control de ganancia para owner-operators. Costo real por milla, la carga evaluada antes de aceptarla, cuánto puedes pagarte después de reservas, y qué brokers y rutas rinden - todo desde tu propio libro.",
  },
  banner: {
    text: "Ya están los cortes de quincena y las reservas. Gratis 7 días, sin tarjeta.",
  },
  nav: {
    links: [
      { href: "#features", label: "Funciones" },
      { href: "#how", label: "Cómo funciona" },
      { href: "#pricing", label: "Precios" },
      { href: "#faq", label: "Preguntas" },
    ],
    signIn: "Entrar",
    cta: "Prueba gratis",
    ctaShort: "Gratis",
    langLabel: "Idioma",
    menuLabel: "Menú",
  },
  hero: {
    titleTop: "Sabe lo que",
    titleMid: "tu camión",
    titleAccent: "de verdad deja.",
    sub: "Contabilidad y control de ganancia para owner-operators, con tus cargas, tu diésel y tus recibos.",
    points: [
      {
        title: "Cada dólar en su lugar",
        body: "Cargas, gastos, diésel, peajes y recibos.",
      },
      {
        title: "Conoce tus números",
        body: "Ganancia real, costo por milla y rentabilidad por carga.",
      },
      {
        title: "Aparta sin pensarlo",
        body: "Impuestos y mantenimiento reservados en cada corte.",
      },
    ],
    cta: "Prueba gratis",
    secondary: "Ver cómo funciona",
    checks: ["Sin tarjeta de crédito", "Cancela cuando quieras", "Hecho para owner-operators"],
  },
  preview: {
    url: "app.onroadbooks.com/dashboard",
    nav: [
      "Panel",
      "Cargas",
      "Gastos",
      "Diésel",
      "Camión",
      "Cortes",
      "Reservas",
      "Análisis",
      "Reportes",
    ],
    settings: "Ajustes",
    title: "Panel",
    period: "1 - 31 ago 2026",
    tiles: {
      revenue: "Ingreso bruto",
      netProfit: "Ganancia neta",
      profitPerMile: "Ganancia / milla",
      marginNote: "margen",
      cpmNote: "costo real / milla $1.84",
      expensesNote: "gastos",
    },
    chart: {
      title: "Ingresos vs gastos",
      revenue: "Ingresos",
      expenses: "Gastos",
      ticks: ["1 ago", "8 ago", "15 ago", "22 ago", "29 ago"],
    },
    breakdown: {
      title: "A dónde va el dinero",
      operatingProfit: "Ganancia operativa",
      taxReserve: "Impuestos (20% de la ganancia)",
      maintenanceReserve: "Mantenimiento (5% del ingreso)",
      emergencyReserve: "Fondo de emergencia (2% del ingreso)",
      available: "Puedes pagarte",
    },
    phone: {
      back: "Detalle de carga",
      route: "Norfolk, VA",
      routeTo: "Newark, NJ",
      milesNote: "612 cargadas - 88 en vacío",
      rate: "Tarifa",
      profit: "Ganancia del viaje",
      perMile: "Por milla total",
      verdict: "BUENA CARGA",
      score: "Puntaje 82 / 100",
    },
    expensesPhone: {
      title: "Gastos",
      total: "Total",
      note: "Agosto",
      labels: [
        "Diésel",
        "Pago del camión",
        "Peajes y comisiones",
        "Mantenimiento y reparaciones",
        "Seguro",
        "Otros",
      ],
    },
  },
  features: {
    title: "Todo lo que necesitas para que el camión deje dinero.",
    items: [
      { title: "Cargas", body: "Cuáles dejaron dinero de verdad y cuáles sólo lo parecían." },
      { title: "Gastos", body: "Diésel, peajes, reparaciones, seguro, permisos - con el recibo adjunto." },
      { title: "Ganancia real", body: "Ganancia neta y margen en cualquier ventana, nunca prorrateada." },
      { title: "Reservas al día", body: "Impuestos y mantenimiento apartados en cada corte que cierras." },
      { title: "Reportes útiles", body: "Reporte mensual listo para imprimir y exportación CSV de todo." },
      { title: "Cabina o cocina", body: "El mismo libro en el teléfono del camión y en la laptop de la casa." },
    ],
  },
  how: {
    title: "No se trata sólo\nde hacer dinero.",
    titleAccent: "Se trata de quedártelo.",
    body: "OnRoad Books te ayuda a entender cada milla, cada gasto y cada dólar para que tomes mejores decisiones y construyas un negocio más sólido en la carretera.",
    script: "Hecho para\nOwner-Operators",
    compareTitle: "Ganancia por milla",
    cards: [
      {
        title: "La mayoría",
        note: "No mide los costos reales",
        value: "$0.50",
        unit: "por milla",
      },
      {
        title: "Usuarios de OnRoad Books",
        note: "Miden lo que importa",
        value: "$1.92",
        unit: "por milla",
      },
    ],
    vs: "VS",
    scriptTwo: "Esa es la diferencia\nde medir bien.",
  },
  proof: {
    eyebrow: "Por qué existe",
    title: "El bruto es el único número que la industria te regala.",
    body: "Todos los demás - los que deciden si vale la pena mover el camión - los tienes que armar tú, y casi ningún owner-operator tiene el tiempo. De eso se encarga esta app.",
    points: [
      "Costo real por milla salido de tu libro, nunca de un promedio nacional",
      "La carga con número antes de aceptarla, no explicada al descargar",
      "Lo que puedes pagarte ya con los impuestos y las llantas apartados",
    ],
    imageAlt: "El camión de un owner-operator en carretera",
  },
  cta: {
    title: "¿Listo para tomar control de tus números?",
    checks: [
      "Empieza tu prueba de 7 días",
      "Sin tarjeta de crédito",
      "Nunca se conecta a tu banco",
      "Cancela cuando quieras y exporta todo",
    ],
    button: "Prueba gratis",
  },
  trust: {
    line: "Tú manejas. El libro va al día.",
    items: [
      "Seguro y privado",
      "Sin conexión bancaria",
      "Tus datos se exportan contigo",
      "Hecho para un camión",
    ],
  },
  pricing: {
    eyebrow: "Precios",
    title: "Menos que una carga mala al año.",
    sub: "Todos los planes traen el motor completo. Catorce días gratis, sin tarjeta por delante.",
    per: "/mes",
    plans: [
      {
        id: "SOLO",
        badge: "El libro",
        featured: false,
        cta: "Prueba gratis",
        tagline: "Un camión, y todos los números de las millas que ya corriste.",
        features: [
          "Un camión, cargas ilimitadas",
          "Cargas, gastos, diésel, recibos y documentos",
          "Ganancia por carga y por milla",
          "Costo real por milla, nunca prorrateado",
          "Reportes para imprimir y exportación CSV",
        ],
        note: null,
      },
      {
        id: "OWNER",
        badge: "La mayoría",
        featured: true,
        cta: "Prueba gratis",
        tagline: "Las decisiones, no nada más el registro.",
        features: [
          "Todo lo de Solo Starter",
          "Calculadora de carga y tarifa objetivo",
          "Tabla de brokers y de rutas",
          "Millas vacías costeadas a tu propio costo por milla",
          "Cortes 1-15 y 16-fin, congelados al cerrarlos",
          "Reservas de impuesto y mantenimiento, y cuánto puedes pagarte",
          "Metas del mes, ritmo y proyección",
        ],
        note: null,
      },
      {
        id: "FLEET",
        badge: "Servicio pagado aparte",
        featured: false,
        cta: "Solicitar acceso Fleet",
        tagline: "De dos a ocho camiones, cada uno con su economía.",
        features: [
          "Todo lo de OnRoad Pro",
          "Hasta ocho camiones en una cuenta",
          "Costo por milla y aporte por unidad",
          "Gastos del negocio separados de los del camión",
          "Cortes de toda la flota",
        ],
        note: "Fleet se activa por separado de una cuenta de un solo camión. Todo lo listado aquí funciona hoy; un segundo acceso para un socio o contador todavía no existe.",
      },
    ],
  },
  faq: {
    title: "Preguntas frecuentes",
    items: [
      {
        q: "¿Tengo que conectar mi banco?",
        a: "No, y no hay nada que conectar. Tú capturas cargas, diésel y gastos - una carga toma menos de un minuto - y adjuntas el recibo si lo quieres en el expediente. Nada se conecta a un banco y nadie más ve tu libro.",
      },
      {
        q: "¿Esto reemplaza a mi contador?",
        a: "No, ni lo intenta. Tu contador presenta la declaración; esto te dice cuánto cuesta una milla y cuánto puedes sacar el día quince. Todo se exporta limpio cuando toca entregar el año.",
      },
      {
        q: "¿Cuánto tardan los números en servir?",
        a: "El costo por milla necesita millas. Captura el último mes o dos de cargas y diésel y el panel arranca de inmediato; la calculadora necesita 500 millas de historia antes de usar la base móvil de 90 días, y siempre te dice con qué base está trabajando.",
      },
      {
        q: "Manejo box truck, hotshot, refrigerado. ¿Importa?",
        a: "No. La matemática es tarifa, millas, vacío y lo que cuesta mover el camión. Pon tus propios umbrales y porcentajes de reserva y la app trabaja a tu operación, no a un promedio nacional.",
      },
      {
        q: "¿Qué pasa con mis datos si dejo de pagar?",
        a: "Los sigues leyendo y exportando - cargas, gastos, diésel, cortes, todo - en CSV. Sólo se cierra la escritura. Ni secuestro de datos ni cobro por exportar.",
      },
      {
        q: "¿El número de \"puedes pagarte\" es asesoría fiscal?",
        a: "No. Es una cifra de planeación: tu ganancia operativa menos los porcentajes de reserva que tú mismo elegiste. No es un saldo bancario ni es asesoría fiscal o contable.",
      },
    ],
  },
  footer: {
    tagline: "Contabilidad hecha para la carretera.",
    links: [
      { href: "#features", label: "Funciones" },
      { href: "#how", label: "Cómo funciona" },
      { href: "#pricing", label: "Precios" },
      { href: "#faq", label: "Preguntas" },
    ],
    disclaimer:
      "OnRoad Books es una herramienta de gestión financiera para transportistas independientes. No es asesoría fiscal, contable ni legal, y las cifras que produce son cifras de planeación basadas en los datos y las tarifas que tú capturas.",
    rights: "Todos los derechos reservados.",
  },
};

export const LANDING_COPY: Record<Lang, LandingCopy> = { en, es };
