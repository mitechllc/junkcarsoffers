# Junk Cars Offers — Public Landing Page

The public "get an offer for your car" site for the Junkyard Ledger business. A
visitor enters their VIN or plate plus contact info; that becomes a new row in
the **OfferRequests** tab of the same Google Sheet `junk_cars_infra` already
runs — Nyang/Commandor then review and respond to it from the **Offer
Requests** tab inside `junk_cars_web` (`junkyard.ezbettor.io`), which emails
the customer their offer.

This repo has **no backend of its own** — it's a static site + a tiny
Cloudflare Worker, talking to the *existing* `junk_cars_infra` Apps Script
project through its one public action, `submitOfferRequest`.

---

## Architecture

```
Visitor enters VIN/plate + contact info on this site
                    ↓
   Cloudflare Worker serves the static page, injects the Apps Script URL
                    ↓
   junk_cars_infra (Apps Script) — submitOfferRequest — writes a new row
   to the OfferRequests tab, emails ALERT_EMAIL a "new lead" notice
                    ↓
   A partner opens junk_cars_web → Offer Requests tab, reviews the lead,
   enters an offer + optional pickup date, clicks Send Offer
                    ↓
   junk_cars_infra emails the customer their offer
```

Three repos are involved, but only this one and `junk_cars_web` have their
own deploys — `junk_cars_infra` is the one shared backend both talk to.

---

## One-time setup

### 1. Add the OfferRequests tab to the existing Sheet

This only needs to happen once, and it's already safe to run even though
`junk_cars_infra` has real production data in every other tab — it only
touches the new `OfferRequests` tab:

Open the Junk Cars Google Sheet → **Extensions → Apps Script** → find
**Setup.gs** → function dropdown → select **setupOfferRequestsOnly_** →
▶ Run. Or from the Sheet itself: **Junk Car System** menu → **Set up Offer
Requests tab (one-time)**.

### 2. Deploy `junk_cars_infra` with the new code

The `submitOfferRequest`, `listOfferRequests`, and `respondToOfferRequest`
actions need to actually be pushed to the live Apps Script project before
either the public form or the `junk_cars_web` "Offer Requests" tab will
work. Deploy `junk_cars_infra` as usual (see that repo's README).

### 3. Create this repo on GitHub, then set its secrets

**Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Same token used for `junk_cars_web`'s Worker, or a fresh one — Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard sidebar |
| `APPS_SCRIPT_URL` | **The exact same Apps Script exec URL `junk_cars_web` already uses** — this is not a new backend, just a second frontend for the one that already exists |

### 4. Deploy

**Actions → Deploy → Run workflow.** Deploys are manual-only by design
(no auto-deploy on push) — trigger it whenever you're ready to ship a change.

### 5. Add a custom domain (optional)

Fresh deploys are reachable at `junkcarsoffers.<your-subdomain>.workers.dev`.
Cloudflare dashboard → Workers & Pages → `junkcarsoffers` → **Settings →
Domains → Add Custom Domain** once you've decided where this should live
(e.g. a subdomain of `ezbettor.io`, or its own domain).

---

## Two things to configure on the `junk_cars_infra` side

These are Script Properties on the Apps Script project (Project Settings →
Script Properties), not anything in this repo:

- **`ALERT_EMAIL`** — already set if inventory alerts are working; a new
  offer request now also emails this address.
- **`BIZ_NAME`** — used as the sign-off name and email subject line on the
  offer email sent to customers. Falls back to "Junkyard Ledger" if unset.

---

## Local development

```
npm install
npx wrangler dev
```

`wrangler dev` won't have `APPS_SCRIPT_URL` set locally — either
`wrangler secret put APPS_SCRIPT_URL` once against your local dev session,
or temporarily hardcode a test URL in `app.js` while testing the form, and
revert before committing.

---

## Repository structure

```
index.html         — the landing page (VIN/plate form, how-it-works section)
style.css           — dark theme, shared visual language with junk_cars_web
app.js              — form submission logic, calls submitOfferRequest
src/
  worker.js         — Cloudflare Worker: serves static assets + /config.js
wrangler.jsonc      — Worker config
package.json        — wrangler dev dependency
.assetsignore       — excludes src/, node_modules/, config files from static asset upload
.github/
  workflows/
    deploy.yml      — GitHub Actions: wrangler-deploys the Worker; manually triggered
```

---

## Security notes

- The one public action this depends on, `submitOfferRequest`, is validated
  server-side in `junk_cars_infra` (VIN-or-plate plus name/email/phone
  required) — this site doesn't need its own validation to be trustworthy,
  but keeps the same checks client-side for a faster "you missed a field"
  experience.
- No secrets of any kind are ever sent to the browser — the Worker only ever
  hands the client the public Apps Script exec URL.
- Every field on this form is untrusted input by the time it reaches
  `junk_cars_web`'s "Offer Requests" tab — that tab escapes it before
  rendering (see `escapeHtml_` in `junk_cars_web/app.js`). If you ever add
  a new place this data gets displayed, escape it there too.
