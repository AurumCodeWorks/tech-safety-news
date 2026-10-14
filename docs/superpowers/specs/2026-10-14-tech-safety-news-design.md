# Tech Safety News — Design Spec

**Date:** 2026-10-14
**Owner:** Enhanced Group (Enhanced Technology Solutions Ltd)
**Status:** Approved 2026-10-14. Three alert types: Scam alert, Tip, Warning (pill label "Watch out").

## 1. Purpose

A small internal app for Enhanced Group staff to write and send a **one-way** email newsletter of scam alerts and basic tech-safety tips to clients — many of them older and less confident with technology.

**Success looks like:**
- A staff member can write, preview, test and send (or schedule) an issue in under 30 minutes without touching HTML.
- Every email renders correctly in classic Outlook (2016/2019/365 desktop, Word engine), new Outlook, Outlook.com, Gmail, and Apple Mail — in light and dark mode.
- Readers find it calm, large, readable, and trustworthy; the only call to action is "phone us".
- Unsubscribes, bounces and complaints are handled automatically and never re-mailed.

**Not goals:** public self sign-up, two-way conversation, marketing automation, multi-tenant use.

## 2. Decisions summary

| Area | Decision |
|---|---|
| Hosting | One Cloudflare Worker (static assets + API) at `news.enhancedgroup.co.uk` (zone already on Cloudflare) |
| Front end | React + Vite via `@cloudflare/vite-plugin` (admin SPA) |
| API | Hono on Workers, TypeScript |
| Storage | D1 (data), R2 (uploaded images), static assets (brand/icons) |
| Scheduling | Cron Trigger every 5 minutes |
| Auth | Cloudflare Access (Microsoft Entra ID login) on `/admin*` and `/api*` only; Worker verifies the Access JWT |
| Email provider | Mailgun, **EU region**, sending domain `news.enhancedgroup.co.uk` |
| Sender | `"Enhanced Group Tech Safety" <noreply@news.enhancedgroup.co.uk>`; no Reply-To; inbound replies silently dropped by a Mailgun route |
| Contacts | Manual CSV import (Office 365 distribution list exports) saved as named lists |
| Email rendering | Fixed, table-based template + structured content blocks, rendered with React Email components inside the Worker |
| Icons | Tabler Icons (MIT), rasterised to PNG for email; never emoji |
| Theming | Light + dark everywhere (admin, archive, email where supported) |
| CI/CD | GitHub Actions → `wrangler deploy`, D1 migrations in pipeline |
| v1 extras | Scheduled sends, public archive, basic send stats, reusable card library |

## 3. Architecture

```
GitHub ──PR──► Actions: typecheck · test · build · contrast check
       ──main─► Actions: d1 migrations apply → wrangler deploy
                                    │
                                    ▼
                 Cloudflare Worker  news.enhancedgroup.co.uk
   ┌───────────────────────────────────────────────────────────────┐
   │ Static assets: React admin SPA, /brand/*, /icons/*            │
   │ Hono routes:                                                  │
   │   /              public archive index        (public)         │
   │   /archive/:slug public web version          (public)         │
   │   /u/:token      unsubscribe GET page + POST (public, signed) │
   │   /webhooks/mailgun  event webhook           (HMAC verified)  │
   │   /media/:key    uploaded images from R2     (public)         │
   │   /admin/*       SPA                         (Access)         │
   │   /api/*         JSON API                    (Access + JWT)   │
   │ scheduled(): cron */5 → send due campaigns                    │
   └───────┬──────────────┬────────────────┬───────────────────────┘
           ▼              ▼                ▼
          D1             R2        Mailgun EU API (api.eu.mailgun.net)
```

**Why no Queues:** list sizes are small (hundreds). Mailgun's batch API accepts up to 1,000 recipients per call with per-recipient variables, so one Worker invocation sends a whole issue in one or two calls. Revisit only if lists exceed ~5,000.

### Repository layout

```
/src/worker/        Hono app, routes, scheduled handler, Mailgun client, auth
/src/app/           React admin SPA (pages, components, theme)
/src/email/         Renderer: blocks → HTML + plain text (shared by preview, send, archive)
/src/shared/        Types + zod schemas (blocks, API payloads), contrast tokens
/migrations/        D1 SQL migrations
/brand/             Master SVGs (logo tile, wordmark lockups)
/scripts/           build-brand.ts (SVG → PNG/ICO), check-contrast.ts
/public/            Generated brand assets, favicons, email icon PNGs
/docs/setup.md      One-time setup: Entra, Access, Mailgun, DNS, secrets
/.github/workflows/ ci.yml, deploy.yml
wrangler.jsonc
```

## 4. Authentication

- **Cloudflare Access application** covers `news.enhancedgroup.co.uk/admin` and `news.enhancedgroup.co.uk/api`. Login method: Microsoft Entra ID (OIDC app registration in the Enhanced Group tenant). Policy: allow members of an Entra group (e.g. "Newsletter Editors").
- **Worker verification:** every `/api/*` request must carry a valid `Cf-Access-Jwt-Assertion` header, verified with `jose` against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, checking `aud` = Access application AUD tag and `iss` = team domain. Reject with 401 otherwise. The verified email is recorded as `created_by` / `sent_by`.
- Config vars: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`.
- **Local dev:** `DEV_AUTH_BYPASS=true` (only honoured when running under `wrangler dev`, never in deployed config) injects a fixed dev user.
- All other public routes are outside the Access application, so no bypass rules are needed.

## 5. Data model (D1)

```sql
lists          (id, name UNIQUE, description, created_at, updated_at)
contacts       (id, email UNIQUE COLLATE NOCASE, name, created_at, updated_at)
list_members   (list_id, contact_id, added_at, PRIMARY KEY (list_id, contact_id))
suppressions   (email PRIMARY KEY COLLATE NOCASE,
                reason CHECK IN ('unsubscribed','bounced','complained','manual'),
                campaign_id NULL, created_at)
cards          (id, type CHECK IN ('scam_alert','tip','warning'),
                title, data JSON, created_at, updated_at, last_used_at)
campaigns      (id, subject, preheader, blocks JSON,
                status CHECK IN ('draft','scheduled','sending','sent','failed'),
                scheduled_at NULL, sent_at NULL, test_sent_at NULL,
                hide_from_archive INTEGER DEFAULT 0, slug UNIQUE NULL,
                created_by, sent_by NULL, created_at, updated_at, last_error NULL)
campaign_lists (campaign_id, list_id, PRIMARY KEY (campaign_id, list_id))
sends          (id, campaign_id, contact_id, email, mailgun_message_id NULL,
                status CHECK IN ('pending','accepted','delivered','failed','complained'),
                opened_at NULL, unsubscribed_at NULL, error NULL, updated_at,
                UNIQUE (campaign_id, email))
settings       (key PRIMARY KEY, value)   -- phone, legal footer, company no., registered office
webhook_tokens (token PRIMARY KEY, received_at)   -- Mailgun webhook replay protection
```

All timestamps stored as UTC ISO strings. Scheduled times are entered and displayed in `Europe/London`.

## 6. Contact lists and CSV import

- Upload a CSV to **create a new list** or **update an existing list**.
- Column detection (case-insensitive): email from `Email`, `Email address`, `PrimarySmtpAddress`, `Mail`; name from `Display name`, `DisplayName`, `Name`, or `First name` + `Last name`. If detection fails, the user maps columns manually.
- Validation: trims whitespace, lowercases for comparison, rejects malformed addresses (listed in the preview with line numbers), de-duplicates within the file.
- **Preview before commit:** "+N new, −N not in file, N unchanged, N invalid, N suppressed". For updates the user chooses whether people missing from the file are removed from the list (default: remove).
- **Suppression wins:** a suppressed address may be imported into a list, but is shown as suppressed and never mailed. Only a manual "remove suppression" action (with a confirmation and reason) can lift a `manual` or `bounced` suppression; `unsubscribed` and `complained` cannot be lifted from the UI.
- Contacts are shared across lists; one person on several selected lists gets one email.
- Export any list back to CSV.

## 7. Editor and content blocks

Campaign fields: **subject** (required, ≤ 90 chars), **preheader** (optional, ≤ 140 chars), ordered **blocks**.

| Block | Fields | Look |
|---|---|---|
| `scam_alert` | title, looksLike (rich), warningSigns (string list, 1–6), whatToDo (rich) | Magenta-accented card, shield icon, "Scam alert" pill |
| `tip` | title, body (rich) | Cyan-accented card, bulb icon, "Tip of the month" pill |
| `warning` | title, body (rich) | Yellow background, key text, alert-triangle icon |
| `text` | body (rich) | Plain paragraph(s) |
| `image` | R2 key, alt (required), caption (optional) | Full-width image, max 600px |
| `call_us` | text (default "Not sure? Call us on {phone}") | Black bar, white text, phone icon, `tel:` link |
| `divider` | — | Thin rule |

- **Rich text** is a restricted Markdown subset: `**bold**`, `[text](https://…)`, line breaks and paragraphs. Everything else is escaped. Links must be `https:` (or `tel:`).
- All block data validated by shared zod schemas on client and server.
- Editor: block list on the left (add, reorder by drag or up/down buttons, duplicate, delete), live preview on the right rendered by `POST /api/preview` (same renderer as sending). Preview toggles: desktop/mobile width, light/dark.
- **Card library:** "Save to library" on `scam_alert`/`tip`/`warning` blocks; "Insert from library" searchable by title. Inserting copies the card (later library edits don't change sent emails).
- **Autosave** drafts every few seconds after changes (debounced `PUT /api/campaigns/:id`).
- **Images:** upload via `POST /api/media` → stored in R2, resized client-side to max 1200px wide (2× of 600) before upload, JPEG/PNG only, ≤ 2 MB after resize.

## 8. Email rendering

One renderer in `/src/email` produces `{ html, text }` from `{ campaign, settings, recipient? }`. Used by preview, test send, real send, and archive (archive passes no recipient → no personal links).

**Compatibility rules (enforced by the template, not the author):**
- Table-based layout, 600px max width, single column, fluid on mobile.
- All CSS inlined; a small `<style>` block only for dark-mode and mobile media queries.
- Classic Outlook: MSO conditional comments for fixed widths, `mso-line-height-rule`, VML-free design (no background images; the call bar is a table cell with solid background, so no VML button needed).
- Web-safe font stack: `Arial, Helvetica, sans-serif`. Body 18px, line-height 1.5; headings 22–24px.
- Every image has `alt`, explicit `width`/`height`, and the meaning is always duplicated in text (icons sit beside text pills) so the email works with images blocked.
- Hidden preheader text with spacer padding.
- Plain-text alternative generated from the same blocks.

**Dark mode:**
- `<meta name="color-scheme" content="light dark">` and `supported-color-schemes`.
- `@media (prefers-color-scheme: dark)` styles for Apple Mail / iOS: dark surfaces, light text, logo swapped (light-mode logo hidden, dark-mode logo shown).
- Outlook.com / new Outlook overrides via `[data-ogsc]` / `[data-ogsb]` selectors.
- Gmail and others that force-invert: colours chosen so inverted results stay legible; icons are rendered *inside* their tinted circle in the PNG so inversion can't separate icon from background.
- Classic Outlook desktop: always the light design.

**Layout of every email:**
1. Header: logo tile + wordmark, issue date, then a thin cyan/magenta/yellow rule.
2. Blocks.
3. Footer:
   - Green shield-check line: "We will never ask for your password or bank details by email."
   - "This is a news-only email — replies aren't read. If you're worried about something, call us on {phone}."
   - Enhanced Technology Solutions Ltd · Company no. 13094854 · Registered office: Unit 43 Dixon Business Centre, Dixon Road, Bristol, BS4 5QW (seeded into settings, editable).
   - "View in browser" · "Unsubscribe" (personal link).
   - Cyber Essentials Plus badge (Enhanced Group is certified), using the **official Blockmark registry email embed**. The image is served live by the registry and links to the public certificate, so it always reflects the current certification status:
     ```html
     <a href="https://registry.blockmarktech.com/certificates/79f52d13-3d5b-4e58-b17a-7e40adecb563/active/?source=email"><img alt="Cyber Essentials Plus logo" src="https://registry.blockmarktech.com/certificates/79f52d13-3d5b-4e58-b17a-7e40adecb563/email-image/?width=83&height=100&non_padded=t" width="83" height="100" style="display:block;border:0;"/></a>
     ```
     Changes from the supplied snippet: the `oncontextmenu` JavaScript attribute is removed (email clients strip it, and script attributes can raise spam scores); `style="display:block;border:0;"` is added to prevent Outlook gaps and link borders. The artwork itself is not altered. In dark mode the badge sits on a white rounded cell (`#FFFFFF`, 6px padding) rather than being recoloured. Certificate ID stored in settings (`ce_certificate_id`) so it can be updated on renewal without a code change.

**Headers on real sends:** `List-Unsubscribe: <https://news.enhancedgroup.co.uk/u/{token}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (Gmail/Yahoo bulk-sender requirement). Implementation must verify Mailgun substitutes `%recipient.*%` variables inside custom headers; fallback is one API call per recipient for these small lists.

## 9. Sending

**Pre-flight checks (block sending if any fail):**
1. Mailgun domain is verified (SPF + DKIM active) — `GET /v4/domains/news.enhancedgroup.co.uk`. Critical because `enhancedgroup.co.uk` DMARC is `p=reject` (inherited by the subdomain): misconfigured DKIM means every email is silently rejected.
2. A test send has happened **after** the campaign was last edited (`test_sent_at > updated_at`).
3. Subject present, at least one block, all blocks valid, all images reachable.
4. At least one recipient after de-duplication and suppression.

**Send flow:**
1. User selects lists → UI shows final count: "182 people · 3 duplicates removed · 2 suppressed".
2. "Send now" or "Schedule" (date/time picker, Europe/London, must be ≥ 5 min in the future). Confirmation dialog states the count.
3. Execution (immediately, or by the cron handler when `scheduled_at <= now`):
   - Atomically claim: `UPDATE campaigns SET status='sending' WHERE id=? AND status IN ('draft','scheduled')` — proceed only if 1 row changed (prevents double sends from overlapping cron ticks).
   - Resolve recipients, insert `sends` rows (`pending`, unique per campaign+email).
   - Render once per batch with Mailgun recipient variables (`%recipient.name%`, `%recipient.unsub_url%`, `%recipient.send_id%`), POST to `https://api.eu.mailgun.net/v3/news.enhancedgroup.co.uk/messages` in batches of ≤ 1,000 with `v:send_id` custom variable.
   - Mark each batch's rows `accepted` with the Mailgun message id; set campaign `sent`, `sent_at`, `sent_by`, generate archive `slug`.
   - On API failure: mark remaining rows' error, campaign `failed` with `last_error`; UI offers "Retry unsent" which only sends rows still `pending`.
- Test send: same renderer, sent to the signed-in user's email (or an address they type), subject prefixed `[TEST]`, not logged in `sends`, sets `test_sent_at`.

**Unsubscribe tokens:** `base64url(send_id) + "." + base64url(HMAC-SHA256(UNSUB_SECRET, send_id))` — verified statelessly; the `sends` row supplies the email and campaign for attribution. Test sends carry a token with a `test` marker that shows "This is a test email — nothing was changed" instead of unsubscribing.

## 10. Webhooks and stats

- `POST /webhooks/mailgun` verifies `signature = HMAC-SHA256(MAILGUN_WEBHOOK_SIGNING_KEY, timestamp + token)`, rejects timestamps older than 5 minutes, and rejects replayed tokens by inserting each token into the `webhook_tokens` table (insert conflict = replay). The cron handler deletes tokens older than 1 hour.
- Events handled (matched via `v:send_id` user variable):
  - `delivered` → `sends.status = delivered`
  - `opened` → `opened_at` (first only)
  - `failed` with severity `permanent` → `failed` + add `bounced` suppression
  - `complained` → `complained` + add `complained` suppression
  - `unsubscribed` (if Mailgun's own tracking fires) → add `unsubscribed` suppression
- Stats page per campaign: sent, delivered, opened (labelled "estimate — some email apps hide opens"), bounced, complained, unsubscribed; drill-down list of bounced/complained addresses.

## 11. Unsubscribe

- `GET /u/:token` shows a simple, large, branded page: "Stop receiving Tech Safety News?" with one big **Unsubscribe** button (POST). GET never unsubscribes on its own — security gateways (including Enhanced Group's inbound `emailsecurity.app`) pre-fetch links and would otherwise unsubscribe people.
- `POST /u/:token` (form button or RFC 8058 one-click) adds an `unsubscribed` suppression, records `unsubscribed_at` on the send, and shows "You've been unsubscribed. If this was a mistake, call us on {phone}."
- Invalid/expired token → friendly page with the phone number.

## 12. Public archive

- `/` lists sent campaigns (newest first) that aren't `hide_from_archive`: title (subject), date, first scam-alert title.
- `/archive/:slug` renders the web version (same renderer, no recipient → generic footer with no personal unsubscribe link).
- Light/dark following the device, plus toggle. Large type, same branding.
- Open Graph tags with the social share image. Indexable (content is public advice).
- Footer shows the **official Blockmark website widget** (iframe, `theme=transparent`, hover tooltip), using the certificate ID from settings:
  ```html
  <iframe src="https://registry.blockmarktech.com/certificates/79f52d13-3d5b-4e58-b17a-7e40adecb563/widget/?tooltip_position=bottom_right&theme=transparent&non_padded=t&hover=t" style="border:none;height:187px;width:132px;" loading="lazy" title="Cyber Essentials Plus certificate"></iframe>
  ```
  A `title` attribute is added for screen readers. In dark mode the iframe sits on a white rounded panel so the transparent artwork stays legible. The archive's Content-Security-Policy allows `frame-src https://registry.blockmarktech.com`.

## 13. Brand and assets

### Logo mark (final)
- Rounded-square tile (corner radius ≈ 26% of tile size).
- Centred icon: **Tabler `shield-search`**, stroke style, optically lifted slightly above centre to clear the strip.
- Bottom edge strip: three equal segments — process cyan `#00AEEF`, magenta `#EC008C`, yellow `#FFF200` — height ≈ 16% of tile, clipped to the tile's rounded corners.
- **Light mode:** tile `#0B0B0B` (key black), icon `#FFFFFF`.
- **Dark mode:** tile `#FFFFFF`, icon `#0B0B0B`.
- Wordmark lockup: "Enhanced Group" (primary) over "Tech Safety News" (secondary), set in **Inter** (OFL) and converted to outlines in the master SVGs.

### Generated assets (`scripts/build-brand.ts`, using `@resvg/resvg-js` + `png-to-ico`)
| Asset | Output |
|---|---|
| Email header logo (light + dark) | `email-logo-light@2x.png`, `email-logo-dark@2x.png` (rendered 2×, displayed at 1×) |
| Admin/archive logo | `logo-light.svg`, `logo-dark.svg` |
| Favicon | `favicon.svg` (internal `prefers-color-scheme` swap), `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `site.webmanifest` |
| Social share | `og-image.png` (1200×630) |
| Email icons | Tabler `shield-search`, `shield-check`, `bulb`, `alert-triangle`, `phone` — each rendered inside its tinted circle, light + dark, 2× PNG |

The script runs in CI before build, so master SVG edits regenerate everything.

### Colour tokens and contrast
| Token | Hex | Use |
|---|---|---|
| `key` | `#0B0B0B` | Logo tile (light), headings, call bar |
| `paper` | `#FFFFFF` | Light surfaces, logo tile (dark) |
| `magenta-ink` | `#EC008C` | Logo, decorative graphics |
| `magenta-text` | `#B0006A` | Scam-alert labels/accents (text) |
| `cyan-ink` | `#00AEEF` | Logo, decorative; text on dark surfaces |
| `cyan-text` | `#006E96` | Tip labels/accents (text on light) |
| `yellow-ink` | `#FFF200` | Logo; "watch out" backgrounds (with key text only) |
| `safe-green` | `#3B6D11` (light) / `#97C459` (dark) | "We'll never ask…" reassurance line |
| neutrals | greys for body text, borders, dark surfaces | — |

### Alert cards (approved 2026-10-14)

All three cards share one structure: 1px border, 8px radius (square in classic Outlook), 34px icon badge circle + text pill in a header row, title (key/white, bold), body text, optional sub-sections. Icons are Tabler, rendered into the badge circle as 2× PNGs (one per mode).

| Element | Scam alert — light | Scam alert — dark | Tip — light | Tip — dark | Watch out — light | Watch out — dark |
|---|---|---|---|---|---|---|
| Icon (Tabler) | `shield-exclamation` | same | `bulb` | same | `alert-triangle` | same |
| Card background | `#FFFFFF` | `#232322` | `#FFFFFF` | `#232322` | `#FFF8B3` | `#2A2810` |
| Card border | `#F3B6D6` | `#6B1F48` | `#A6DDF2` | `#0E4D66` | `#E6D500` | `#6B6300` |
| Badge circle / icon | `#FCE4F1` / `#B0006A` | `#4A0F30` / `#FF7AC2` | `#E0F4FB` / `#006E96` | `#08384B` / `#5CCBF2` | `#FFF200` / `#0B0B0B` | `#FFF200` / `#0B0B0B` |
| Pill bg / text | `#FCE4F1` / `#8A0053` | `#4A0F30` / `#FFB8DE` | `#E0F4FB` / `#005273` | `#08384B` / `#A9E6FA` | `#0B0B0B` / `#FFF200` | `#FFF200` / `#0B0B0B` |
| Pill label | "Scam alert" | same | "Tip of the month" | same | "Watch out" | same |
| Title | `#0B0B0B` | `#FFFFFF` | `#0B0B0B` | `#FFFFFF` | `#0B0B0B` | `#FFF6A0` |
| Body text | `#3D3D3A` | `#D3D1C7` | `#3D3D3A` | `#D3D1C7` | `#2A2A10` | `#E8E4C0` |
| Sub-heading ("Warning signs") | `#B0006A` | `#FF7AC2` | — | — | — | — |
| "What to do" line | `#0B0B0B` bold | `#FFFFFF` bold | — | — | — | — |

Approximate contrast (the CI checker is authoritative): titles and body 10:1 or higher in every mode; pill text 7.5:1 or higher; accent sub-headings 6.6:1 or higher; badge icons 5:1 or higher against their circle. Card borders are decorative and carry no meaning, so they are exempt.

Page backgrounds behind cards: light `#F4F4F2`, dark `#161615`.

**Rules:** body/small text ≥ 4.5:1, large text and meaningful graphics ≥ 3:1 (WCAG 2.2 AA). Cyan-ink and yellow-ink are never used as text on light backgrounds. `scripts/check-contrast.ts` computes every declared foreground/background pair in light and dark themes and **fails CI** on any breach.

## 14. Admin app

- Pages: Dashboard, Emails (draft/scheduled/sent, duplicate), Editor, Card library, Lists (+ import), Suppressions, Settings (sender display name, phone, legal footer, company number, registered office).
- Dashboard shows next scheduled send, last send's stats, and a red banner if the Mailgun domain check fails.
- Light/dark: follows `prefers-color-scheme`, with a manual toggle remembered in `localStorage` (wrapped in try/catch).
- Tabler icons throughout (React package `@tabler/icons-react`). No emoji.
- Accessible: keyboard navigable, visible focus rings, form errors inline.

## 15. Setup prerequisites (documented in `docs/setup.md`)

1. **Entra ID:** app registration "Cloudflare Access" (client ID, secret, tenant ID; redirect `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`); Entra group "Newsletter Editors".
2. **Cloudflare Zero Trust:** add Entra ID login method; Access application for `/admin` + `/api` with group policy; copy AUD tag.
3. **Mailgun (EU):** add domain `news.enhancedgroup.co.uk`; add its SPF TXT, DKIM TXT, MX (for the reply-drop route) and tracking CNAME in Cloudflare DNS; wait for verification; create route "match_recipient('.*@news.enhancedgroup.co.uk') → stop()" to discard replies; create webhook pointing at `/webhooks/mailgun`; copy API key + webhook signing key.
4. **Email security gateway:** allow-list Mailgun's sending for `news.enhancedgroup.co.uk` so internal test sends arrive.
5. **Cloudflare resources:** D1 database, R2 bucket, Worker custom domain `news.enhancedgroup.co.uk`.
6. **Secrets:** `wrangler secret put` for `MAILGUN_API_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `UNSUB_SECRET`. GitHub repo secrets: `CLOUDFLARE_API_TOKEN` (Workers + D1 edit scopes), `CLOUDFLARE_ACCOUNT_ID`.
7. **Settings:** seeded by the first migration with company number `13094854`, registered office `Unit 43 Dixon Business Centre, Dixon Road, Bristol, BS4 5QW`, phone `0117 472 9200`; editable in the app.
8. **Cyber Essentials Plus badge:** no file needed. Email and archive use the official Blockmark registry embeds (§8, §12); certificate ID `79f52d13-3d5b-4e58-b17a-7e40adecb563` is seeded into settings as `ce_certificate_id`. On renewal, update the ID in Settings if the registry issues a new one.

## 16. CI/CD

- **`ci.yml` (pull requests):** install → `build-brand` → `check-contrast` → typecheck → unit/integration tests → `vite build`.
- **`deploy.yml` (push to `main`):** same checks → `wrangler d1 migrations apply --remote` → `wrangler deploy` (via `cloudflare/wrangler-action`).
- Single production environment; local development with `wrangler dev` / Vite dev server and local D1/R2.

## 17. Testing

- **Unit (Vitest):** CSV column detection + diff, rich-text sanitiser, block schemas, unsubscribe token sign/verify, webhook signature verify, recipient resolution (dedupe + suppression), contrast checker, scheduling time-zone conversion (including BST changeover).
- **Worker integration (`@cloudflare/vitest-pool-workers`):** API routes against local D1; Access JWT verification (valid, wrong aud, expired); send flow with Mailgun mocked (`fetch` stub) including double-claim prevention and partial failure retry; cron handler; unsubscribe GET doesn't unsubscribe, POST does.
- **Renderer:** snapshot tests of HTML + text output per block type; assertion that output contains no `<div>`-based layout, no external CSS, every `<img>` has alt/width/height.
- **Manual email-client checklist before first live send:** classic Outlook desktop (2016/2019/M365), new Outlook, Outlook.com, Gmail web + Android, Apple Mail macOS + iOS (light and dark), with images on and off.

## 18. Error handling summary

| Failure | Behaviour |
|---|---|
| Mailgun domain unverified | Send/schedule disabled; dashboard banner |
| Mailgun API error mid-send | Campaign `failed`, `last_error` shown, "Retry unsent" sends only `pending` rows |
| Cron overlap | Atomic status claim prevents double sends |
| Invalid webhook signature | 401, not processed |
| CSV with bad rows | Shown in preview; valid rows importable |
| Image upload too large / wrong type | Inline error, nothing stored |
| Access JWT missing/invalid | 401 JSON; SPA shows "Your session expired — reload to sign in" |

## 19. Out of scope (v1)

Microsoft Graph sync of distribution lists, public sign-up forms, A/B testing, multiple sender identities, rich free-form HTML editing, per-link click tracking, multi-language.

## 20. Open items

- ~~Scam-alert colour~~ — confirmed deep magenta (2026-10-14).
- ~~Legal footer details~~ — confirmed (company no. 13094854, registered office in §8).
- ~~Cyber Essentials Plus badge~~ — resolved: official Blockmark registry embeds (2026-10-14).
