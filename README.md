# OnRoad Books

Production: [onroadbooks.com](https://onroadbooks.com/)

A financial operating console for **owner-operators and small fleets of up to
eight trucks**. It answers one question on every screen: *is each truck, and the
business as a whole, actually making money?*

> The displayed name comes from `NEXT_PUBLIC_APP_NAME` in `.env`; change it there and it
> updates across the UI and page titles.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first visit lands on `/setup`, where you create
the workspace owner -- email, password, business name. After that, `/login`.
Owners can invite teammates from Team as Admin, Bookkeeper, Dispatcher or
Viewer; each person receives an individual sign-in and every permission is
enforced on the server.

No database setup required: the app boots on a local JSON store. The account you
create receives a private, empty workspace and a guided first-run setup; the
deterministic August 2026 reference dataset is reserved for tests and database
smoke checks.

---

## What it does

**Dashboard** -- visible trial time or active plan status, the full period selector (Today / This Week / 1-15 / 16-End / Full Month / Quarter / Year to Date / Custom range), four
headline KPIs (gross revenue, operating expenses, net profit, net margin), seven
operating metrics (total / loaded / deadhead miles, deadhead %, revenue, cost and
profit per mile), a daily revenue-vs-expense chart, the Money Breakdown, and
deterministic insight cards.

**Money Breakdown** -- the statement that matters:

```
Gross Revenue
- Operating Expenses
= Operating Profit
- Tax Reserve            (default 20% of operating profit)
- Maintenance Reserve    (default 5% of gross revenue)
- Any other bucket the owner configured
= SAFE TO PAY YOURSELF
```

A reserve is charged against operating profit or against gross revenue,
whichever that bucket is set to. Tax follows profit, and a losing month reserves
nothing for it -- the base is floored at zero rather than going negative.
Maintenance follows revenue, because the truck wears out whether or not the
month was profitable. Safe to Pay Yourself is a planning figure: it is not a
bank balance and it is not tax advice.

**True cost per mile** -- every operating expense dated in the window divided by
every mile driven in it, loaded *plus* empty, split into fixed and variable
lines. Nothing is prorated: if the truck note posts on the 1st, the first half
of the month really did carry it. Forward-looking tools use a separate rolling
90-day basis instead, so one annual bill inside the selected period cannot
change the answer to "what should I quote".

**Load calculator** -- two questions on one cost model. *Evaluate*: the broker is
offering $700, is it worth running? *Target*: I want $1.50/mile of profit, what
do I quote? Fuel from miles, MPG and price; tolls, dispatch and factoring as a
percentage or a flat amount; and the truck's own overhead per mile, which
excludes those four precisely because the form already asks for them.

**Loads** -- dense sortable table with search and broker / status / rating /
date-range filters, a totals row, and a detail page per load carrying the trip
cost waterfall and its documents. Adding a load takes six fields; total miles,
both rate-per-mile figures, trip expenses, trip profit, profit per mile and the
profitability rating calculate live as you type. Every trip cost also appears
in the operating-expense ledger on the load date, including loads saved by an
older build; a linked detailed Fuel entry replaces the load fuel estimate so it
is never counted twice.

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
POD, Invoice, Other), expenses (Receipt, Invoice, Other), every fleet truck
(Registration, Insurance, Title, Inspection) and maintenance records. The browser
optimizes large images and scanned PDFs, then uploads the result directly to
private Supabase Storage with a short-lived signed URL. The stored-file limit is
10 MB; searchable/native PDFs are preserved instead of being rasterized.

**Accountant exports** -- CSV for Loads, Expenses, Fuel, Profit & Loss Summary,
Mileage and Maintenance, plus a print stylesheet for save-as-PDF. Exports use the
page's own period query string, so what downloads is exactly what is on screen.

**Expenses** -- 16 categories, each classified fixed or variable (editable in
Settings). Donut + ranked bar breakdown, inline edit and delete.

**Fuel** -- gallons, price, odometer and location per fill-up, with tank-to-tank
MPG, segment MPG per fill, average price and fuel cost per mile. Every fuel entry
also writes a matching `FUEL` row to the expense ledger, so operating costs stay
complete without double entry.

**Settlements** -- the half-month review, 1-15 and 16-end. An open settlement
recomputes live; closing it freezes a snapshot and posts the reserve
contributions for the period. Reopening clears the snapshot and reverses exactly
those contributions, leaving manual movements alone. If the rows underneath a
closed settlement later change, it shows a drift notice rather than silently
rewriting the number the owner already paid themselves on.

**Reserve buckets** -- virtual buckets, not bank accounts: tax, maintenance, and
any others the owner adds. A balance is always the running sum of its signed
transactions, so it can be explained line by line. Contributions post on
settlement close; manual contributions, withdrawals and corrections are always
available. Dashboard and Reserves show the amount suggested by the saved
percentages immediately and label the separately recorded balance explicitly.

**Goals and pace** -- monthly targets for revenue, profit, profit per mile,
maximum deadhead and load count, with progress, pace and an end-of-month
projection. A shorter window compares against a share of the monthly target
scaled by working days, and always says that it was pro-rated. Rates and
ceilings never scale with the length of the window.

**Lane and broker intelligence** -- directional state-to-state lanes (`VA>NJ` is
not `NJ>VA`, and the two are never averaged), ranked only once a lane has run at
least three times. Two loads is an anecdote.

**Fleet** -- up to eight trucks on the paid OnRoad Fleet service, each with its own
contribution and cost per mile. A truck is never charged a share of the phone bill; business
overhead is subtracted once, visibly, at the fleet level, so the fleet view ties
back exactly to the net profit on the dashboard.

**Reports** -- current vs previous period across twelve metrics, half-month split,
fixed vs variable analysis, and four trend charts (revenue vs expenses, net profit,
revenue per mile, cost per mile). Adds a Year-to-Date period option.

**Truck** -- a read-first profile with full-width odometer, ownership and unit
status cards, an explicit Update truck editor, plus lifetime revenue, expenses,
profit, miles and cost per mile.

**Settings** -- business name, currency, both built-in reserve percentages (with
a live preview against real period numbers), monthly goals and the working week,
the load profitability thresholds with a visual scale, the deadhead and
maintenance warning thresholds, the fixed/variable classification matrix, and a
compact subscription summary that links out instead of embedding a plan selector.

**Plans & Billing** -- a dedicated comparison for Solo Starter, OnRoad Pro and
OnRoad Fleet. Stripe Checkout creates the subscription, signed webhook events
keep its status and plan synchronized, and the Stripe-hosted customer portal
handles payment methods, invoices, plan changes and cancellation.

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

> The reasoning behind the decisions below -- why cost per mile is never
> prorated, why a closed settlement freezes, why trip fuel never enters a
> period total -- is recorded as Architecture Decision Records in
> [`docs/adr/`](docs/adr/README.md). Read them before changing anything in
> `src/lib/finance`.

```
src/
  proxy.ts                 the auth gate; cookie presence only
  app/
    page.tsx               public landing page
    login/ setup/ welcome/ owner account, first run, onboarding
    (app)/                 route group carrying the sidebar shell
      dashboard/ loads/ expenses/ fuel/ truck/ (maintenance lives here)
      calculator/ analytics/ reports/ settlements/ reserves/ fleet/ settings/
    api/                   auth, health, Stripe webhook, exports and documents
  components/
    ui/                    shadcn-style primitives (compact, tabular-friendly)
    shell/                 sidebar, mobile drawer, theme
    cockpit/               dashboard panels: cost per mile, owner pay, insights
    dashboard/ loads/ expenses/ fuel/ truck/ maintenance/ settings/
    calculator/ settlements/ reserves/ fleet/ documents/ reports/
    charts/                Recharts wrappers with shared tooltip + theming
    print/                 the printed report
    marketing/             landing page (its own fixed palette, see ADR-0019)
    auth/ onboarding/      sign-in, setup and first-run flows
    shared/                page header, empty state, field, badges, metrics
  lib/
    calculations.ts        the primitive layer: div, rounding, period totals
    finance/               the product layer, one file per question (ADR-0008)
    periods.ts             month / half-month resolution and comparison
    categories.ts          expense taxonomy + fixed/variable defaults
    formatters.ts          currency, miles, rates, percentages, dates
    schemas.ts             zod validation shared by forms and server actions
    actions/               server actions (create / update / delete)
    auth/                  scrypt passwords, signed cookie sessions
    db/                    repository interface + JSON and Prisma stores
    storage/               document storage adapter (local / Supabase)
    plans.ts               the plan catalogue, in code (ADR-0017)
    marketing/             landing page copy and figures
    seed/                  deterministic reference fixture for tests and local QA
  generated/prisma/        generated Prisma client (git-ignored)
prisma/
  schema.prisma            users/roles, businesses/subscriptions, trucks/drivers,
                           loads/expenses/fuel/maintenance/documents, reserves,
                           owner and driver settlements, settings and goals
  seed.ts                  seeds Postgres with the same reference fixture
docs/adr/                  architecture decision records
```

**No formula is written inside a component.** Components call the money code,
which lives in two layers: `lib/calculations.ts` holds the primitives and
`lib/finance/` holds the product's answers, one file per question. Those are the
only places a division happens -- and every division goes through `div()`, which
returns `0` rather than `Infinity` or `NaN`. See
[ADR-0008](docs/adr/0008-two-calculation-layers.md).

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
| True cost per mile | Period Expenses / Period Total Miles (loaded + deadhead), never prorated |
| Trailing cost basis | the same, over a rolling 90 days -- used by the calculator, target rate and deadhead costing |
| Overhead per mile | trailing cost per mile minus fuel, tolls, dispatch and factoring (subtracted as dollars, divided once) |
| Reserve amount | max(Operating Profit, 0) x % for an operating-profit bucket, Gross Revenue x % for a revenue bucket |
| Safe to Pay Yourself | Operating Profit - every configured reserve |
| Load score | 50 pts profit/mile (full at 1.25x the GREAT floor) + 30 pts margin (full at 60%) + 20 pts deadhead (nothing at 2x the warn level); it never overrules the rating |
| Truck contribution | the unit's revenue - the unit's own costs; business overhead is subtracted once at the fleet level |

### Revenue and expense accounting

Trip-level costs recorded **on a load** (fuel, tolls, dispatch, factoring, other)
drive per-load profitability and the rating. By default they are also posted to
the **expense ledger**, so period Net Profit and True Cost / Mile use the same
dollars. Existing historical loads are not reinterpreted silently; the dashboard
offers a one-click bookkeeping check to post them. The places that could drift
write to the ledger automatically --

- saving a **load** creates one deterministic row per non-zero trip cost, keyed
  `expload_<load id>_<cost>`; a detailed Fuel entry linked to the load replaces
  the generated fuel row to avoid double counting;

- adding a **fuel entry** creates its matching `FUEL` ledger row, keyed
  `expfuel_<entry id>` so edits and deletes stay in step in both stores;
- logging a **maintenance service** optionally creates its ledger row and keeps
  the two linked, so editing or deleting one updates the other.

Rows the app writes for you are badged **From Load** / **From Fuel** / **From Service** in the
expense table and are read-only there — they link back to the record that owns
them, because editing them in place would just be overwritten.

In the reference fixture the ledger's dispatch and factoring rows reconcile exactly with
the per-load fees, which is what you want to see when auditing the two views
against each other.

### Documents and storage

Documents follow the same pattern as rows. `lib/storage/` defines a
`DocumentStorage` adapter; local development ships `LocalDocumentStorage`, which writes to
`data/uploads/` and serves through `/api/documents/[id]`. `SupabaseDocumentStorage`
is selected by `DOCUMENT_STORAGE=supabase`; it talks to the Storage REST API
with plain `fetch`. Signed upload, metadata lookup, signed download, tenant
isolation, byte verification and deletion have all been exercised against the
production project. Only metadata lives in the database, so moving buckets
never touches application code.

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
npm run db:seed       # load the local QA reference fixture
```

No application code changes. If `DATA_SOURCE` is anything other than `postgres`,
or `DATABASE_URL` is not a Postgres URL, the app falls back to the JSON store
rather than failing to boot.

### Fleet

Every `Load`, `Expense` and `FuelEntry` carries `businessId` and `truckId`, and
an expense carries a scope: `TRUCK` charges a unit, `BUSINESS` is overhead and
carries no truck. Paid OnRoad Fleet raises the truck limit to eight, enforced
server-side in the action that creates one rather than by hiding a button. A
single-truck ledger written before any of this upgrades in place -- covered by
`fleet-migration.test.ts`.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | the test suite (see below) |
| `npm run test:e2e` | Playwright browser flows against an isolated local ledger |
| `npm run db:generate` | regenerate the Prisma client |
| `npm run db:push` | push the schema to Postgres |
| `npm run db:seed` | seed Postgres with the local QA reference fixture |
| `npm run smoke:postgres` | check the Prisma store against a live database |
| `npm run certify:database` | audit production RLS/Data API and run an isolated import + Postgres smoke test |
| `npm run certify:storage` | exercise production upload/download/delete and cross-workspace isolation |
| `npm run certify:invitations` | exercise verified Supabase invitation acceptance and replay protection |
| `npm run certify:backup-restore` | restore a production logical backup into disposable local PostgreSQL and compare it |

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
semantic: **green only for positive financial performance, red only for negative
or critical**, amber for attention, blue for neutral operational metrics. A
relative ranking is not performance -- the weakest lane in a list of good lanes
is not painted red. Light mode is fully supported via the toggle in the header.
Desktop is the priority; tables scroll horizontally on small screens and the
sidebar becomes a drawer.

## Security posture

- **Authentication** supports email/password plus verified Google identities,
  workspace invitations and five server-enforced roles. Passwords and app
  sessions use `node:crypto`: scrypt hashing with a per-user salt, constant-time
  comparison, and an HMAC-SHA256 signed session cookie (`httpOnly`,
  `sameSite=lax`, `secure` in production). `proxy.ts` gates every route
  except the landing page `/` (matched exactly, never by prefix), `/login`,
  `/setup`, `/api/auth/*`, `/api/health`, the Stripe webhook, and static assets outside `/api/` -- pages redirect,
  API routes get a 401. The proxy only checks that the cookie is present;
  the signature and expiry are verified server-side by `getSession()`, keeping
  authorization in the same trusted path as each request. `AUTH_SECRET` signs the cookie and is
  **ignored unless it is at least 32 characters**; with no usable value a key
  is generated once into `data/.auth-secret` (mode 0600), which is fine locally
  and wrong for a deployment, because a restart on new hardware signs
  everyone out.
- **Every repository instance is bound to a `businessId`** taken from the
  session, and the binding is checked on read *and* on write. A repository
  cannot be constructed without one. Both storage implementations support
  multiple private workspaces, and the production certification verifies that
  one workspace cannot read or mutate another's rows or files.

Everything found in the audit is fixed:

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
- **A corrupt `data/onroad-books.json` is never overwritten.** It is renamed
  aside and the failure surfaces, rather than a real ledger being silently
  replaced with generated data.

## Tests and CI

```bash
npm test
npm run test:e2e
```

The current `node:test` suite contains **272 passing tests**. It covers the parts where a quiet
mistake costs money rather than throwing an error:

| File | What it pins down |
| --- | --- |
| `calculations.test.ts` | division by zero and non-finite input, `roundMoney` symmetry and the `-$0.00` case, trip costs counted once, profit rated per mile *driven* (a $4.00/loaded-mile load with 300 empty miles rates MARGINAL against a plain $3.00 run at GREAT), reserve maths including a losing month |
| `finance.test.ts` | the product layer: cost per mile refusing to prorate a monthly cost across the halves, the trailing basis falling back when the window is thin, overhead per mile excluding what the calculator asks for directly, reserves and safe-to-pay always reconstructing operating profit, the score never disagreeing with the rating about which load is better, a target rate that really does clear the target after fees, lanes staying directional and unranked below three loads, and a pro-rated goal saying that it was pro-rated |
| `fleet-migration.test.ts` | a single-truck ledger upgrading in place, and the fleet reconciliation: contributions minus overhead equals the dashboard's net profit, to the cent |
| `plans.test.ts` | prices, limits and ranks matching what is sold, the cockpit closed on Solo and open on OnRoad Pro, paid Fleet access requiring an active provider subscription, a legacy Individual ledger carried up rather than down, truck limits, trial dates, safe downgrades, and a lapsed subscription closing writes |
| `periods.test.ts` | every period key, leap years, year rollover on the previous-period comparison, week anchoring, a reversed custom range, impossible dates like `2026-02-30`, and that the two halves of a month sum exactly to the full month |
| `maintenance.test.ts` | overdue on either measure, `BOTH` meaning whichever comes first, urgency scored against the user's own thresholds rather than an assumed miles-per-day, and zero thresholds |
| `export.test.ts` | CSV formula neutralisation, RFC 4180 quoting, no row wider than its header, and summary labels staying out of numeric columns |
| `store-contract.test.ts` | the JSON and Prisma stores expose the same shape, so the Postgres implementation cannot drift without the suite noticing |
| `store-behaviour.test.ts` | the rules both stores must keep: a fuel purchase appears in the ledger exactly once across create/edit/delete, a service record's ledger row lives and dies with it, deleting a load unlinks its costs instead of deleting them, an odometer never moves backwards, a session cannot touch another business's rows, an older ledger file upgrades instead of crashing, and a corrupt one is set aside rather than replaced |

The store tests run against a temporary directory, never `data/`. Five serial
Playwright flows exercise owner signup and onboarding, protected routes, loads,
expenses, local document upload, Fleet drivers, frozen driver-pay statements,
role boundaries and the authenticated mobile shell. Their ledger, uploads and
session key live under `.e2e-data`, never the developer's local books.

Two notes on running them. The suite passes `--conditions=react-server` so
that the `server-only` marker resolves to its empty build instead of throwing;
that is what the `test` script does for you. And the JSON store resolves its
paths per call rather than at import, which is what lets a test point it at a
scratch directory.

`.github/workflows/ci.yml` runs types, lint, unit tests, Playwright and a production build on
every push and pull request, and then a second job against a real Postgres
service: `prisma db push`, `npm run db:seed`, `npm run smoke:postgres`. That
last one is `scripts/postgres-smoke.ts`, which asserts what only a server can
prove -- that every reserve bucket handed out is a row, that closing a
settlement stores the snapshot and posts its contributions, that reopening
removes exactly those, that a fuel purchase keeps one linked ledger row, and
that a repository bound to another business cannot read these rows. See
[ADR-0021](docs/adr/0021-exercise-the-postgres-store-in-ci.md).

Production readiness, Stripe webhook alerts, incident response and the
backup-restoration drill are documented in the [operations runbook](docs/operations.md).

---

## Not built yet (deliberately)

Invoice generation and IFTA reporting remain deliberately outside this release.
CSV and print-to-PDF are implemented; a native XLSX/PDF renderer and city/market
lane grouping remain later refinements.

Stripe Checkout, the customer billing portal and signed webhook synchronization
are implemented. Each deployment requires its Stripe secret, webhook signing
secret and three recurring Price IDs; production health checks fail when that
configuration is incomplete, and synchronization failures are logged and can
be forwarded immediately to the operations alert webhook.

Fleet workspaces include individual sign-ins, Owner/Admin/Bookkeeper/Dispatcher/
Viewer roles, email invitations through Supabase Auth, drivers, load assignment
and frozen driver-pay statements. `/setup` creates the first workspace owner;
additional people join through `/invite/accept`.

The Supabase storage adapter is selected by `DOCUMENT_STORAGE=supabase`. Its
signed upload, metadata lookup, signed download, byte-for-byte verification and
cleanup flow has been exercised against the live project. CI drives the safe,
deterministic browser flows against local adapters; Google, email delivery and
Stripe-hosted pages remain deployment smoke checks because CI must not create
real identities, send email or enter payment details.
