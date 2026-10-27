# OnRoad AI — WhatsApp freight assistant

A driver sends a load on WhatsApp — typed, a screenshot, a rate confirmation
PDF or a voice note — and gets back the same numbers OnRoad Books' load
calculator would show: loaded and real RPM, direct costs, contribution,
maintenance, score, GREAT/GOOD/MARGINAL/BAD, the operational-minimum verdict,
ASK / TARGET / WALK AWAY and TAKE / NEGOTIATE / PASS. Any driver can use it;
each one has their own profile.

Status: **Phase 1 built and tested; the DAT-independent parts of Phases 2–3
built and tested (preferences, compare, summary, alerts); Phase 4 built and
tested (operator console, plans and Stripe billing, abuse controls,
monitoring, cost reporting) and switched off until configured. Not connected to
WhatsApp yet; live search and alerts stay off until an authorized load board
exists.** The
routes answer 404 until `ONROAD_AI_ENABLED=true` and the Meta secrets are set.
Decision record: [ADR 0033](adr/0033-whatsapp-assistant-reuses-the-calculator.md).

---

## 1. How it fits in the existing app

| Piece | Where | Notes |
|---|---|---|
| Calculation engine (reused, unchanged) | `src/lib/finance/load-calculator.ts`, `finance/load-score.ts`, `calculations.ts` (`rateLoad`) | `calculateLoadEstimate`, `calculateTargetRate`, `compareOfferToThresholds`, `evaluateOperationalMinimum`, `suggestedOpeningQuote`, `realRpmForDisplay`, `calculateLoadScore`, `scoreBand` |
| Freight analysis | `src/lib/onroad-ai/analyze.ts` | Maps profile + load onto the calculator page's exact inputs (overhead 0, debt service 0), adds equipment checks and the decision |
| Profile | `onroad-ai/profile.ts`, `settings.ts` | Per-driver MPG, diesel, fees, maintenance, floor, thresholds, truck limits; `mpg 9`-style commands |
| Interpretation | `onroad-ai/quick-parse.ts` (free), `ai/anthropic.ts`, `ai/schema.ts` | Shorthand never reaches a model; everything else is a forced tool call, cleaned in TypeScript |
| Voice | `ai/openai-transcriber.ts` | Off without `OPENAI_API_KEY` |
| Rendering | `format.ts`, `copy.ts`, `broker-message.ts` | English and Spanish; one message per answer |
| WhatsApp gateway | `whatsapp/signature.ts`, `payload.ts`, `client.ts` | HMAC verification, payload parsing, Cloud API with retries |
| Router | `router.ts` | Onboarding, commands, follow-ups, quotas |
| Queue / worker | `processor.ts` | Event table as queue, per-sender lease, retries |
| Store | `store/types.ts`, `store/drizzle.ts`, `store/memory.ts` | Every driver-scoped method takes the driver's id |
| Load boards | `loadboard/provider.ts`, `dat.ts` (disabled), `mock.ts` (TEST DATA), `search.ts` | Authorized providers only |
| Routes | `src/app/api/whatsapp/webhook`, `/admin`, `/maintenance`, `/alerts`, `/stripe` |
| Operator console | `src/app/(app)/admin/onroad-ai/page.tsx`, `onroad-ai/admin-data.ts`, `onroad-ai/monitoring.ts`, `lib/actions/onroad-ai-admin.ts` | Platform admins only |
| Plans and billing | `onroad-ai/plans.ts`, `onroad-ai/stripe-billing.ts` | Off until a price and webhook secret are set | Exempt from the session proxy; each checks its own secret |
| History | `onroad-ai/history.ts` | Compare (re-priced on today's profile), 30-day summary, deterministic suggestions with sample guards |
| Alerts | `onroad-ai/alerts.ts`, `/api/whatsapp/alerts` | Opt-in, dedupe, caps, 24-hour window, approved template |
| Tables | `src/db/schema/onroad-ai.ts`, `drizzle/0020_onroad-ai.sql`, `drizzle/0021_onroad-ai-alerts.sql`, `drizzle/0022_onroad-ai-operations.sql` | `AssistantUser`, `AssistantInboundEvent`, `AssistantProcessingLease`, `AssistantLoad`, `AssistantOutboundMessage`, `AssistantUsage`, `AssistantAlert`, `AssistantAlertMatch` |

Nothing in `src/lib/finance/`, the calculator page or any other OnRoad Books
module was changed. Files outside `onroad-ai/` that were touched:
`src/proxy.ts` (one public path), `src/db/schema/index.ts` (one export),
`vercel.json` (one daily cron), `.env.example`, `package.json` (one script),
`scripts/run-database-contracts.ts` (one test file), `docs/adr/README.md`.

### Same load, same numbers

`src/lib/__tests__/onroad-ai-parity.test.ts` runs the calculator page's own
composition next to `analyzeLoad` for four fixtures (including the Arrington
→ Rio Rancho validation case from `load-calculator-floor.test.ts`) and
requires **deep equality** of the estimate, the rate tiers and the offer
comparison.

---

## 2. Run it locally (no Meta account needed)

```bash
npm run onroad-ai:simulate
```

You talk to the real router, onboarding and calculator in the terminal, with
an in-memory store and the TEST DATA load board on. If `ANTHROPIC_API_KEY` is
exported in that shell, free text and `/photo path/to/screenshot.png` go to
the model too (that spends tokens).

Try:

```
hola
26 ft box truck
ok
6.70
1.80
5 3.5
Chicago IL Miami FL 1400 millas $2800
120
dh 50
el broker ofrece $3100
1
guardar
historial
mpg 9
buscar cargas cerca de Chicago
borrar mis datos
```

Text shorthand, calculations, negotiation and broker-message drafts work without
an AI key. For the current load, `dh 50`, `50 dh`, `dh 50 millas` and
`dead head 50` update the empty miles to pickup and recalculate the same load;
`dh after 50` changes only the explicitly stated empty miles after delivery.
Free-form interpretation, images and PDFs require `ANTHROPIC_API_KEY`; voice
transcription also requires `OPENAI_API_KEY`.

Tests: `npm test` (everything, no network) and `npm run test:database` (adds
the Drizzle store contract against a disposable PostgreSQL).

### Chat bubble inside OnRoad Books

The same bot, in a chat window inside the app — no Meta account, no phone.

1. In `.env.local`: `ONROAD_AI_WEBCHAT=true`, `ONROAD_AI_STORE=memory`
   (locally) and your email in `PLATFORM_ADMIN_EMAILS`.
2. Restart `npm run dev`, sign in, and tap the round button at the bottom
   right of any page.

Everything a WhatsApp driver can do works there: onboarding, pasted loads,
screenshots and PDF rate cons (with `ANTHROPIC_API_KEY`), the quick-reply
buttons, history, compare, alerts. Voice notes are WhatsApp-only. The chat is
`POST /api/onroad-ai/chat` (signed-in session, same origin, platform admins
only, 404 otherwise); it swaps the WhatsApp client for one that returns the
replies in the HTTP response. Your web profile is its own driver record
(`web-<userId>`), separate from any WhatsApp number and from your OnRoad
Books loads. It is a testing window, not yet a product feature for every
account.

To run the webhook itself locally, set `ONROAD_AI_ENABLED=true`,
`ONROAD_AI_STORE=memory` and the four `WHATSAPP_*` values in `.env.local`,
restart your dev server, and expose it with a tunnel (Meta needs public
HTTPS). Deploying to Vercel is usually simpler — see below.

---

## 3. Connect the Meta WhatsApp Cloud API

You need a Meta Business account (business.facebook.com) and a Meta developer
account (developers.facebook.com).

1. **Create the app.** developers.facebook.com → My Apps → Create app →
   type **Business** → add the **WhatsApp** product. Meta gives you a free
   **test phone number** and a temporary token.
2. **Allow your own phone.** WhatsApp → API Setup → "To" → add and verify your
   personal WhatsApp number (the test number can only message numbers on
   this list, max 5).
3. **Permanent token.** Business settings → Users → **System users** → add an
   admin system user → assign the app and the WhatsApp account → **Generate
   token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`. The temporary token from step 1 expires
   in 24 hours; do not use it in Vercel.
4. **Collect the values:**
   - `WHATSAPP_PHONE_NUMBER_ID` — API Setup, under the test number
   - `WHATSAPP_ACCESS_TOKEN` — the system user token
   - `WHATSAPP_APP_SECRET` — App settings → Basic → App secret
   - `WHATSAPP_VERIFY_TOKEN` — make one up (16+ characters), e.g.
     `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
5. **Set them in Vercel** (Production), plus `ONROAD_AI_ENABLED=true`,
   `ONROAD_AI_ADMIN_TOKEN` (32+ characters) and, for voice notes,
   `OPENAI_API_KEY`. `ANTHROPIC_API_KEY`, `CRON_SECRET` and the Neon variables
   are already there. Redeploy.
6. **Register the webhook.** WhatsApp → Configuration → Webhook → Edit:
   - Callback URL: `https://onroadbooks.com/api/whatsapp/webhook`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN`
   - Verify and save, then **Subscribe** to the `messages` field.
7. **Check it** with the operations API:
   ```bash
   curl -H "Authorization: Bearer $ONROAD_AI_ADMIN_TOKEN" https://onroadbooks.com/api/whatsapp/admin
   ```
   It reports whether AI and voice are configured, provider status, counts
   and today's estimated cost.

### Your first real test message

From the phone you added in step 2, send **hola** (or **hi**) to the test
number. Answer the five setup questions (reply **OK** to each suggestion or
**SKIP** to accept them all), then send:

```
Chicago IL Miami FL 1400 miles $2800 120 DH
```

With the 26 ft / 8.5 MPG / $6.70 / 5% / 3.5% / $0.20 / $1.80 profile the
reply shows TOTAL 1,520 mi, contribution $1,363.88, MARGINAL, 69/100, and
NEGOTIATE with ASK $2,900 — the same numbers the web calculator gives for
those inputs.

**Do not call it live until that round trip has actually worked.**

### Going beyond the test number

To message drivers who are not on your allow-list: add a real phone number
to the WhatsApp Business Account, complete **business verification**, set a
display name (Meta reviews it), and add a payment method. Drivers start the
conversation themselves (they message you), which is the opt-in for replies.

### WhatsApp rules the code already follows

- **24-hour window.** Free-form replies only within 24 h of the driver's last
  message; outside it the send is skipped and logged `WINDOW_CLOSED`. A
  retried event from yesterday never becomes an unsolicited message.
- **Pricing (since 2026-10-01).** Each delivered service reply is billed after
  the first 1,000 per business number per month (~$0.0034 each in North
  America). Each answer is one message; the broker message is the one
  deliberate second bubble. `ONROAD_AI_WHATSAPP_COST_PER_MESSAGE` feeds the
  cost estimate.
- **No proactive messages.** Nothing is sent that a driver did not just ask
  for. Alerts (Phase 3) will need an approved **utility template** and a
  recorded opt-in, and are not built.

---

## 4. What the bot will and will not do

- It **never** books a load, contacts a broker, accepts a rate or sends the
  broker message itself — the driver copies it.
- It **never** invents a value. Missing loaded miles, deadhead or rate → one
  short question. No return deadhead unless the driver says so.
- Shorthand, numbers and settings are parsed deterministically (free). The
  model is used for free text, screenshots, PDFs and (via speech-to-text)
  voice; it only transcribes into a schema and never writes the reply.
- Screenshots are data: instructions inside them are ignored, every field is
  re-validated, and there is no field through which a verdict or reply text
  could come back from the model.
- Monthly costs (insurance, truck note, ELD, DAT…) are never charged to one
  load. Contribution is never called take-home pay.
- A GOOD load that misses the driver's minimum is shown as both; passing the
  minimum alone is never a TAKE.

### Limits and costs (per driver, editable by env)

8 messages/minute, 200 messages/day, 60 AI reads/day, 30 voice notes/day,
4 MB per image/PDF. Usage and estimated cost (AI tokens, audio minutes,
WhatsApp replies) are counted per driver per day in `AssistantUsage`.

### Privacy and retention

- Only the WhatsApp id (phone number) and an optional display name identify a
  driver. No password, no OnRoad Books account.
- Media bytes are downloaded, read and dropped in the same request; never
  stored. Outbound message bodies are never stored, only their length.
- Inbound message payloads are cleared after `ONROAD_AI_RETENTION_DAYS`
  (default 30) by the daily maintenance cron; the row and status stay.
- "delete my data" / "borrar mis datos" + confirmation erases the profile,
  loads, usage, outbound log and inbound events. Support can do the same:
  `POST /api/whatsapp/admin {"action":"deleteUser","waId":"1555…"}`.
- Logs carry status codes and error class names, never message text or
  tokens. Customer data is not used to train models.

---

## 4b. Phases 2–3: what works without DAT

| Driver says | What happens |
|---|---|
| `prefer destination VA NC` · `destino preferido VA` · `prefer origin IL` · `clear preferences` | Saved per driver (state codes or names). Search results and alerts list those lanes first, marked ★. |
| `history` → `compare 1 2` | Two (or three) history loads side by side, **re-priced with today's profile** so they are judged on one basis; says which wins per mile and which brings more dollars. |
| `summary` / `resumen` | Last 30 days from the numbers recorded at the time: loads checked/saved, offers over miles, weighted RPM and contribution/mi, classes, verdicts, best lane (2+ loads), offers under the minimum. Suggestions only when the data supports them: deadhead cost (3+ loads each side), how much countering raised the rate (2+ loads). |
| `alert me loads above $2.20/mi within 100 miles of Chicago IL` · `avísame cargas hacia VA` | Saved **only if an authorized load board is available** (today: no; dev: TEST DATA board). Creating one records the opt-in. |
| `my alerts` · `stop alert 2` · `STOP` | List, stop one, or stop all and record the opt-out. |

Alert delivery rules (enforced in `alerts.ts`, tested in `onroad-ai-phase3.test.ts`):

- Each alert is checked at most every `ONROAD_AI_ALERT_INTERVAL_MINUTES` (60).
- Up to 3 loads per message, 5 per driver per day, 3 active alerts per driver.
- A load is sent once per alert (unique key), and is recorded only after a successful send.
- Inside the 24-hour window: a normal message with the shortlist; reply `1` prices one.
- Outside it: only the approved template in `WHATSAPP_ALERT_TEMPLATE` (utility category, body
  `{{1}}` loads, `{{2}}` alert description, e.g. "OnRoad AI: {{1}} new loads match your alert ({{2}}). Reply to see them.").
  With no template, nothing is sent and the loads wait for the driver's next message.
- Never after STOP. Broker details only where the provider's licence allows (`brokerDisplayAllowed`).

Scheduling: the daily Vercel cron (`/api/whatsapp/maintenance`) runs the alerts once a day.
For hourly checks, point any scheduler at `GET /api/whatsapp/alerts` with
`Authorization: Bearer $CRON_SECRET` — e.g. a scheduled GitHub Actions workflow (the repo
is public, so Actions minutes are free). Not added yet, because alerts have nothing to
check until a load board is connected.

Still blocked on DAT: live search results, alerts firing in production, confirmed
(routed) deadhead. Still not built: the optional link to an OnRoad Books account.

---

## 4c. Phase 4: running it as a business

**Operator console, `/admin/onroad-ai`** (platform admins only, linked from `/admin`):
status of every integration, drivers (numbers masked), PRO subscribers and MRR,
messages and estimated cost for 30 days split into AI reads, voice, WhatsApp replies and
fixed infrastructure, estimated margin, the last 14 days, 24-hour health, and per-driver
plan, activity, loads and cost with a Block / Unblock button. Buttons: retry waiting
messages, check alerts now. No message content is ever shown.

**Plans.** FREE and PRO, daily limits in env (see `.env.example`). Billing is off until
`STRIPE_PRICE_ONROAD_AI_MONTHLY` and `STRIPE_ONROAD_AI_WEBHOOK_SECRET` are set; until
then everyone keeps the beta limits. The price is set in Stripe; there is no price in
the code. Drivers write `plan`, `upgrade` / `mejorar` (Stripe Checkout link) or
`manage subscription` (Stripe portal). PRO stays PRO while Stripe retries a card
(`past_due`) and drops to FREE when Stripe cancels. When the plan changes, the driver
gets one message if they are inside the 24-hour window.

**Stripe wiring.** Same Stripe account as OnRoad Books, separate endpoint
`/api/whatsapp/stripe` with its own signing secret. Everything OnRoad AI creates carries
`metadata.product = "onroad-ai"`. **One guard was added to `/api/stripe/webhook`** so the
OnRoad Books endpoint skips those events instead of failing on a subscription with no
workspace and making Stripe retry for days. Nothing else in OnRoad Books billing changed.

**Abuse and cost controls.** Block a number (console, or `POST /api/whatsapp/admin
{"action":"block","waId":"..."}`): it gets no replies and costs nothing. Optional country
allowlist for first contacts (replies are billed by the recipient's country), a cap on
brand-new numbers per hour, plus the per-minute burst limit and daily quotas.

**Monitoring.** The daily maintenance cron checks the last 24 hours and emails the
operator once, through the same Resend alert channel OnRoad Books uses, when: any message
failed permanently, 20%+ of sends failed (10+ sends), 20+ messages are waiting, today's
estimated cost passed `ONROAD_AI_DAILY_BUDGET_USD`, or new numbers spiked.

**Cost reporting.** Usage rows split cost into `aiCostMicros`, `transcribeCostMicros` and
`whatsappCostMicros` (their sum is `costMicros`). All costs are estimates from configured
unit prices; the WhatsApp line is an upper bound because of Meta's 1,000 free replies.
Revenue is the sum of active PRO amounts captured at the last Stripe sync.

---

## 5. DAT readiness checklist

Live load search stays OFF until every box is ticked. The bot tells drivers
plainly that live search is not connected.

- [ ] Developer account at https://developer.dat.com/ (or ask
      developersupport@dat.com) for **OnRoad AI as a company**, not a
      driver's personal DAT login.
- [ ] Written confirmation from DAT that a **multi-user commercial product**
      may (a) search on behalf of its users, (b) **display results** to them,
      (c) display **broker names and contact details**, and (d) under what
      per-user DAT subscription requirements, if any.
- [ ] The commercial terms: fees, rate limits, caching / retention limits,
      attribution rules.
- [ ] API documentation for search, load details, equipment codes and
      deadhead/origin parameters, from DAT — the adapter is written **from
      that**, not guessed.
- [ ] Credentials issued and stored only in Vercel (`DAT_CLIENT_ID`,
      `DAT_CLIENT_SECRET`), `DAT_API_ENABLED=true`, and
      `DAT_COMMERCIAL_USE_CONFIRMED=true` set only after the written OK.
- [ ] `DatLoadBoardProvider.searchLoads` / `getLoadDetails` implemented and
      tested against DAT's sandbox; distances labelled as DAT's estimate.
- [ ] A routing source for confirmed deadhead (optional; until then deadhead
      is shown as "board est.").
- [ ] Alerts (Phase 3): approved utility template, opt-in/opt-out flow,
      frequency caps — only after the above.

Not allowed at any point: scraping, browser automation against DAT, shared
credentials, unofficial endpoints.

---

## 6. Still missing before launch

| Item | Who | Notes |
|---|---|---|
| Meta app, test number, system-user token, app secret | Enrique | Section 3 |
| Vercel env: `ONROAD_AI_ENABLED`, `WHATSAPP_*`, `ONROAD_AI_ADMIN_TOKEN`, `OPENAI_API_KEY` | Enrique | `CRON_SECRET`, `ANTHROPIC_API_KEY`, Neon already set |
| Deploy (runs migrations `0020` to `0022` on production Neon) | Enrique | Creates the empty `Assistant*` tables and their columns; no OnRoad Books table changes |
| First round-trip test from your phone | Enrique + Claude | Section 3, "first real test message" |
| Business verification, real number, display name, payment method | Enrique | Only to go beyond the 5 test recipients |
| Terms / privacy text for WhatsApp users | Enrique | The existing /terms and /privacy cover OnRoad Books accounts, not WhatsApp-only drivers |
| DAT access and written commercial permission | Enrique ↔ DAT | Section 5 |
| Decide the PRO price and FREE limits; create the Stripe price and the second webhook endpoint | Enrique | Billing stays off until then |
| `PLATFORM_ADMIN_EMAILS` includes your email | Enrique | Needed to open `/admin/onroad-ai` |
| Alert template approved in Meta (utility) | Enrique | Only needed for alerts outside the 24-hour window |
| Hourly alert scheduler | Claude | Add once a load board is connected |
| Optional link to an OnRoad Books account | Phase 3 | Today the bot's profile is independent of any workspace |
