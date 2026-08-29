# OnRoad Books

A bookkeeping and financial operating console built for a **single box truck
business**. It answers one question on every screen: *is the truck actually
making money?*

> **Bookkeeping Built for the Road.** The product name is configured through
> `NEXT_PUBLIC_APP_NAME` and defaults to `OnRoad Books`.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. No database setup required -- the app boots on a
local JSON store seeded with a realistic August 2026 dataset (plus three months
of history so trends and period comparisons are populated).

---

## What it does

**Dashboard** -- the full period selector (Today / This Week / 1-15 / 16-End / Full Month / Quarter / Year to Date / Custom range), four
headline KPIs (gross revenue, operating expenses, net profit, net margin), seven
operating metrics (total / loaded / deadhead miles, deadhead %, revenue, cost and
profit per mile), a daily revenue-vs-expense chart, the Money Breakdown, and
deterministic insight cards.

**Money Breakdown** -- the statement that matters:

```
Gross Revenue
- Operating Expenses
= Operating Profit
- Tax Reserve (default 20% of operating profit)
- Maintenance Reserve (default 5% of gross revenue)
= Available Cash
```

**Loads** -- dense sortable table with search and broker / status / rating /
date-range filters, a totals row, and a detail page per load carrying the trip
cost waterfall and its documents. Adding a load takes six fields; total miles,
both rate-per-mile figures, trip expenses, trip profit, profit per mile and the
profitability rating calculate live as you type.

**Load profitability score** -- every load is rated GREAT / GOOD / MARGINAL / BAD
on **profit per total mile**, never on gross rate per mile. Gross rate minus fuel,
tolls, dispatch, factoring and other trip costs, divided by loaded *plus* deadhead
miles. A $4.19/loaded-mile broker running 35% deadhead rates below a $3.87 broker
running clean -- and the app says so. Thresholds are editable in Settings.

**Trip cost breakdown** -- the load detail page opens on a waterfall: gross rate at
the top, every cost taken off it with proportional bars, trip profit at the bottom,
then total miles, profit per mile, margin and the rating verdict.

**Deadhead analytics** -- deadhead miles and share, the variable spend attributable
to running empty, that cost expressed per *total* mile, the rate dilution against
the loaded-mile rate, and the revenue those empty miles would have earned. Crossing
the configurable threshold turns the card and the insight amber.

**Broker performance** -- a league table on Reports ranking brokers by trip profit,
with deadhead share and profit per mile alongside revenue, so a high-volume broker
paying thin rates cannot hide behind its top line. Best and weakest relationships
are called out explicitly.

**Maintenance** -- a service log plus an upcoming-due list on the Truck page. Each
item is tracked by DATE, MILEAGE or BOTH (whichever comes first), with green /
amber / red status: "Due in 1,250 miles", "Due in 23 days", "Renews in 42 days",
"Overdue by 50 days". Selecting a service type prefills the interval. Logging a
service optionally writes a matching row to the expense ledger, so the cost is
counted exactly once.

**Documents** -- receipts and paperwork attach to loads (Rate Confirmation, BOL,
POD, Invoice, Other), expenses (Receipt, Invoice, Other), the truck (Registration,
Insurance, Title, Inspection) and maintenance records. Drag-and-drop or file
picker, images and PDFs up to 10 MB, viewable and downloadable in place.

**Accountant exports** -- CSV for Loads, Expenses, Fuel, Profit & Loss Summary,
Mileage and Maintenance, plus a print stylesheet for save-as-PDF. Exports use the
page's own period query string, so what downloads is exactly what is on screen.

**Expenses** -- 16 categories, each classified fixed or variable (editable in
Settings). Donut + ranked bar breakdown, inline edit and delete.

**Fuel** -- gallons, price, odometer and location per fill-up, with tank-to-tank
MPG, segment MPG per fill, average price and fuel cost per mile. Every fuel entry
also writes a matching `FUEL` row to the expense ledger, so operating costs stay
complete without double entry.

**Reports** -- current vs previous period across twelve metrics, half-month split,
fixed vs variable analysis, and four trend charts (revenue vs expenses, net profit,
revenue per mile, cost per mile). Adds a Year-to-Date period option.

**Truck** -- profile plus lifetime revenue, expenses, profit, miles and cost per
mile.

**Settings** -- business name, currency, both reserve percentages (with a live
preview against real period numbers), the load profitability thresholds with a
visual scale, the deadhead and maintenance warning thresholds, and the
fixed/variable classification matrix.

---

## One period model, everywhere

`lib/periods.ts` is the only place a date range is decided. Every screen, and
every CSV export, filters through it:

| Period | Range |
| --- | --- |
| Today | the current calendar day |
| This Week | Monday to Sunday containing today |
| 1 - 15 | first half of the selected month |
| 16 - End | second half, 28/29/30/31 aware |
| Full Month | the selected month |
| Quarter | the quarter containing the selected month |
| Year to Date | Jan 1 to the end of the selected month |
| Custom | any two dates |

Switching period re-runs every calculation against the rows whose *actual dates*
fall inside the resolved range. Monthly totals are never divided in two: a truck
note paid on the 1st lands entirely in the first half, a repair on the 22nd
entirely in the second, and the two halves always sum to the full month.

Each period also knows its own comparison window, so the deltas mean something:
half-months compare against the other half rolling backwards, months against the
previous month, quarters against the previous quarter, and Today / This Week /
Custom against the equally sized window immediately before them.

Period state lives in the URL (`?month=2026-08&period=first`, or
`?period=custom&from=2026-08-04&to=2026-08-19`), so every server component on a
page computes from the same range, any view is shareable, and the export routes
accept the identical query string.

---

## Architecture

```
src/
  app/
    (app)/                 route group carrying the sidebar shell
      dashboard/ loads/ expenses/ fuel/ reports/ truck/ settings/
  components/
    ui/                    shadcn-style primitives (compact, tabular-friendly)
    shell/                 sidebar, mobile drawer, theme
    dashboard/ loads/ expenses/ fuel/ reports/ truck/ settings/
    charts/                Recharts wrappers with shared tooltip + theming
    shared/                page header, empty state, field, badges, metrics
  lib/
    calculations.ts        every financial formula, divide-by-zero safe
    formatters.ts          currency, miles, rates, percentages, dates
    periods.ts             month / half-month resolution and comparison
    categories.ts          expense taxonomy + fixed/variable defaults
    schemas.ts             zod validation shared by forms and server actions
    actions/               server actions (create / update / delete)
    db/                    repository interface + JSON and Prisma stores
    seed/                  deterministic demo dataset
  generated/prisma/        generated Prisma client (git-ignored)
prisma/
  schema.prisma            User, Business, Truck, Load, Expense, FuelEntry,
                           FinancialSettings
  seed.ts                  seeds Postgres with the same demo dataset
```

**No formula is written inside a component.** Components call
`lib/calculations.ts`, which is the only place a division happens -- and every
division goes through `div()`, which returns `0` rather than `Infinity` or `NaN`.

### Formulas

| Metric | Definition |
| --- | --- |
| Total Miles | Loaded + Deadhead |
| Revenue / Loaded Mile | Gross Rate / Loaded Miles |
| Revenue / Total Mile | Gross Rate / Total Miles |
| Trip Expenses | Fuel + Tolls + Other |
| Trip Profit | Gross Rate - Trip Expenses |
| Profit / Mile (load) | Trip Profit / Total Miles |
| Period Gross Revenue | sum of load gross rates in the period |
| Period Expenses | sum of expense-ledger amounts in the period |
| Net Profit | Gross Revenue - Expenses |
| Net Margin | Net Profit / Gross Revenue x 100 |
| Revenue / Cost / Profit per Mile | each divided by period total miles |
| Deadhead % | Deadhead Miles / Total Miles x 100 |
| Deadhead cost | Deadhead Miles x Variable Cost per Mile |
| Deadhead cost / total mile | Deadhead Cost / Total Miles |
| Rate dilution | Revenue per Loaded Mile - Revenue per Total Mile |
| Load rating | GREAT >= $2.00, GOOD >= $1.50, MARGINAL >= $1.00, else BAD (profit per **total** mile, thresholds editable) |
| Tax Reserve | max(Operating Profit, 0) x tax % |
| Maintenance Reserve | Gross Revenue x maintenance % |
| Available Cash | Operating Profit - Tax Reserve - Maintenance Reserve |

### Revenue and expense accounting

Trip-level costs recorded **on a load** (fuel, tolls, dispatch, factoring, other)
drive per-load profitability and the rating. Period operating expenses come from
the **expense ledger** only. This avoids double counting: real money is entered
once, in the ledger, and the two places that could drift write to it
automatically --

- adding a **fuel entry** creates its matching `FUEL` ledger row, keyed
  `expfuel_<entry id>` so edits and deletes stay in step in both stores;
- logging a **maintenance service** optionally creates its ledger row and keeps
  the two linked, so editing or deleting one updates the other.

Rows the app writes for you are badged **From Fuel** / **From Service** in the
expense table and are read-only there — they link back to the record that owns
them, because editing them in place would just be overwritten.

In the demo data the ledger's dispatch and factoring rows reconcile exactly with
the per-load fees, which is what you want to see when auditing the two views
against each other.

### Documents and storage

Documents follow the same pattern as rows. `lib/storage/` defines a
`DocumentStorage` adapter; the MVP ships `LocalDocumentStorage`, which writes to
`data/uploads/` and serves through `/api/documents/[id]`. A Supabase Storage
implementation is a drop-in -- the shape is written out in a comment in that
file. Only metadata lives in the database, so moving buckets never touches
application code.

`Document` rows carry four optional owner columns (`loadId`, `expenseId`,
`truckId`, `maintenanceId`) with exactly one set, which is why one upload path
serves rate confirmations, receipts, registrations and service invoices alike.

### Exports

`lib/export.ts` defines each report once as columns + rows. CSV is implemented;
adding PDF or XLSX later means writing one renderer, not six reports.

---

## Switching to PostgreSQL / Supabase

The app talks to a `Repository` interface, never to a database directly. Two
implementations exist: `JsonRepository` (default) and `PrismaRepository`.

```bash
# .env
DATA_SOURCE="postgres"
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

```bash
npm run db:generate   # regenerate the client
npm run db:push       # create tables
npm run db:seed       # load the same demo dataset
```

No application code changes. If `DATA_SOURCE` is anything other than `postgres`,
or `DATABASE_URL` is not a Postgres URL, the app falls back to the JSON store
rather than failing to boot.

### Multi-truck readiness

Every `Load`, `Expense` and `FuelEntry` already carries `businessId` and
`truckId`, and `Business` has a `trucks` relation. Adding a fleet later is a
filter and a selector, not a migration. The UI stays deliberately single-truck.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | regenerate the Prisma client |
| `npm run db:push` | push the schema to Postgres |
| `npm run db:seed` | seed Postgres with the demo dataset |

---

## Reading and density

The whole interface is rem based and driven by one CSS variable, so the **text
size control in the sidebar footer** (next to the theme toggle) zooms text,
padding, control heights and table rows together rather than only enlarging the
font. Four steps -- Compact, Default, Large, Largest -- persisted per browser.

The type scale itself: 12px for uppercase labels and metadata, 13px for
secondary text, 14px for table and body copy, 15px for panel titles, 20px for
page titles, and 24-36px for the headline figures. All figures use tabular
numerals so columns stay aligned at every scale.

## Design notes

Dark-first operations console: dark sidebar, dark neutral content surfaces, 8-9px
row padding, tabular-figure numerics so columns align, and a strict colour
semantic -- green = profit, red = expense, amber = attention, blue = neutral
operational metric. Light mode is fully supported via the toggle in the header.
Desktop is the priority; tables scroll horizontally on small screens and the
sidebar becomes a drawer.

## Security posture

There is no authentication yet — that is the deliberate gap, and it is the
one thing to close before this is exposed beyond localhost. Everything else
found in the audit is fixed:

- **Uploads** accept a strict MIME allowlist (PNG, JPEG, WebP, HEIC/HEIF, GIF,
  PDF). SVG is refused: it is a script-bearing document, and it was previously
  admitted by a `startsWith("image/")` check.
- **Stored documents** are served with `nosniff`, a `sandbox` CSP, and
  `Content-Disposition: attachment` for anything outside a small
  inline-safe set, so a mislabelled file cannot execute in the app's origin.
- **CSV exports** neutralise leading `=`, `+`, `-`, `@`, tab and CR with an
  apostrophe. These files are opened by a third party on another machine, so
  formula injection there is somebody else's problem to suffer.
- **Uploads reject oversized bodies on `Content-Length`** before buffering,
  and refuse cross-origin posts (route handlers get none of the Origin
  checking Next.js applies to server actions).
- **Security headers** are set site-wide. Note the CSP still needs
  `script-src 'unsafe-inline'` for Next's bootstrap and the theme script, so
  it is defence in depth, not an XSS backstop; a nonce pipeline would let
  that go.
- **A corrupt `data/truckledger.json` is never overwritten.** It is renamed
  aside and the failure surfaces, rather than a real ledger being silently
  replaced with demo data.

## Not built yet (deliberately)

Authentication, receipt file upload, invoice generation, IFTA reporting, and
multi-truck UI. The data model accommodates all of them; the MVP focuses on the
financial product.
