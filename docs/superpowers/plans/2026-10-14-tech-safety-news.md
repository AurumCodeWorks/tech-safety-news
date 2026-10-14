# Tech Safety News Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Enhanced Group's one-way scam-alert newsletter app: a Cloudflare Worker serving a React admin (behind Cloudflare Access), an Outlook-safe light/dark email renderer, Mailgun EU sending with scheduling, CSV contact lists, a public archive, and automatic bounce/unsubscribe handling.

**Architecture:** One Worker (Hono) owns every route; Workers static assets serve the Vite-built React SPA and generated brand files, with `run_worker_first: true` so the Worker decides routing. D1 stores all data, R2 stores uploaded images, a 5-minute Cron Trigger sends scheduled campaigns. One renderer module (`src/email`) produces HTML + plain text for preview, test send, real send and archive.

**Tech Stack:** TypeScript, Node 22 (CI), Wrangler, `@cloudflare/vite-plugin`, Vite, React 18+, React Router (data-less `BrowserRouter`), Hono, zod, jose, `@react-email/components` + `@react-email/render`, papaparse, `@tabler/icons` (SVG source) + `@tabler/icons-react`, `@resvg/resvg-js`, `png-to-ico`, `opentype.js` + `@fontsource/inter`, Vitest + `@cloudflare/vitest-pool-workers` (worker project) + jsdom + `@testing-library/react` (app project), tsx (scripts).

**Spec:** `docs/superpowers/specs/2026-10-14-tech-safety-news-design.md` — read it alongside this plan; section numbers (§) below refer to it.

## Global Constraints

- Install current stable versions with `npm install`; commit `package-lock.json`. No other runtime dependencies than those listed in Tech Stack without a note in the task.
- Hostname `news.enhancedgroup.co.uk`; public base URL `https://news.enhancedgroup.co.uk`.
- Sender `"Enhanced Group Tech Safety" <noreply@news.enhancedgroup.co.uk>`; **no Reply-To header**.
- Mailgun base URL `https://api.eu.mailgun.net`, domain `news.enhancedgroup.co.uk`, batch size ≤ 1000 (var `MAILGUN_BATCH_SIZE`, default `1000`). Always send `o:tracking-clicks=no` (rewritten links look like phishing) and `o:tracking-opens=yes`.
- Every real send carries `List-Unsubscribe: <{unsub_url}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- Cron `*/5 * * * *`. User-facing times are `Europe/London`; stored as UTC ISO strings.
- Bindings: `DB` (D1), `MEDIA` (R2), `ASSETS`. Vars: `PUBLIC_BASE_URL`, `MAILGUN_DOMAIN`, `MAILGUN_BASE_URL`, `MAILGUN_BATCH_SIZE`, `SENDER_ADDRESS`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`. Secrets: `MAILGUN_API_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `UNSUB_SECRET`. `DEV_AUTH_BYPASS` exists only in `.dev.vars`; `TEST_NOW` (ISO string, overrides the clock) is only ever passed by tests.
- Settings keys (seeded): `sender_name`=`Enhanced Group Tech Safety`, `phone`=`0117 472 9200`, `legal_name`=`Enhanced Technology Solutions Ltd`, `company_number`=`13094854`, `registered_office`=`Unit 43 Dixon Business Centre, Dixon Road, Bristol, BS4 5QW`, `ce_certificate_id`=`79f52d13-3d5b-4e58-b17a-7e40adecb563`.
- Email template: 600px max, table layout, inline CSS, `Arial, Helvetica, sans-serif`, body 18px / line-height 1.5, headings 22–24px. Colour values exactly as spec §13 tables.
- Contrast: text ≥ 4.5:1, large text/meaningful graphics ≥ 3:1. Cyan-ink `#00AEEF` and yellow-ink `#FFF200` never used as text on light backgrounds.
- Icons are Tabler only. **No emoji anywhere** in UI, email, or copy.
- Light and dark themes for admin, archive and email.
- Footer copy (exact): "Messages from this service will never ask for your personal information." and "This is a news-only email — replies aren't read. If you're worried about something, call us on {phone}."
- Pill labels (exact): "Scam alert", "Tip of the month", "Watch out". Block types: `scam_alert`, `tip`, `warning`, `text`, `image`, `call_us`, `divider`.

## Review Focus

1. **O365 CSV quirks** — files exported from Office 365 / Excel start with a UTF-8 BOM and may be semicolon-delimited; the importer must still find the `Email` column (test in Task 7).
2. **Hostile or unusual names** — `O'Brien`, `Zoë`, `<b>Bob</b>`, `"Smith, Ann"` must render escaped in HTML, unchanged in plain text, and survive Mailgun recipient-variables JSON (test in Task 6 and Task 11).
3. **Clock changes** — scheduling 01:30 on 25 Oct 2026 (ambiguous) picks the first (BST) occurrence; 01:30 on 28 Mar 2027 (doesn't exist) is rejected with a clear message; times < 5 min ahead are rejected (test in Task 9).
4. **Editing after test / during send** — any edit after a test send re-requires a test; editing or rescheduling a campaign in `sending`/`sent` returns 409 (test in Task 9).
5. **Webhooks for unknown sends** — events for test sends or missing `send_id` return 200 and are ignored, never 500 (Mailgun retries 5xx for hours) (test in Task 13).

---

## File Structure

```
wrangler.jsonc                 bindings, vars, cron, assets (run_worker_first)
vite.config.ts                 react + @cloudflare/vite-plugin
vitest.config.ts               projects: worker (pool-workers), app (jsdom)
tsconfig.json / tsconfig.worker.json / tsconfig.app.json
index.html                     SPA entry
migrations/0001_init.sql       schema (§5)
migrations/0002_seed_settings.sql
brand/logo-tile.svg            master mark (light); dark derived in script
scripts/build-brand.ts         SVG → PNG/ICO/OG, email icons, wordmark outlines
scripts/check-contrast.ts      CI contrast gate over src/shared/tokens.ts
src/shared/tokens.ts           all colour tokens + contrastPairs
src/shared/contrast.ts         WCAG luminance/ratio
src/shared/blocks.ts           zod block + campaign schemas, types
src/shared/richtext.ts         markdown subset → html/text
src/shared/time.ts             londonLocalToUtc / utcToLondonLocal
src/shared/api-types.ts        request/response types shared by app + worker
src/worker/index.ts            Hono app, fetch + scheduled exports
src/worker/env.ts              Env type
src/worker/auth.ts             Access JWT middleware
src/worker/db/*.ts             one module per table group (settings, lists, contacts, suppressions, cards, campaigns, sends)
src/worker/csv.ts              parse + column detection + diff
src/worker/recipients.ts       resolveRecipients
src/worker/mailgun.ts          Mailgun client (send, domain check)
src/worker/tokens.ts           unsubscribe token sign/verify
src/worker/send.ts             runCampaignSend, preflight
src/worker/scheduled.ts        cron handler
src/worker/routes/*.ts         api-lists, api-campaigns, api-cards, api-media, api-status, api-settings, unsubscribe, webhooks, archive, media
src/email/render.tsx           renderCampaign()
src/email/components/*.tsx     Layout, Header, Footer, ScamAlert, Tip, Warning, TextBlock, ImageBlock, CallUs, Divider
src/email/styles.ts            dark-mode / mobile CSS strings
src/email/plaintext.ts         blocks → text
src/app/main.tsx, App.tsx      router (basename /admin), layout
src/app/theme.ts               applyTheme, toggle, safe localStorage
src/app/api.ts                 fetch wrapper (401 → session-expired event)
src/app/pages/*.tsx            Dashboard, Emails, Editor, Library, Lists, ListImport, Suppressions, Settings, CampaignStats
src/app/editor/*.tsx           BlockList, BlockForm per type, Preview, SendDialog
test/worker/*.test.ts, test/app/*.test.tsx, test/email/*.test.ts, test/shared/*.test.ts
.github/workflows/ci.yml, deploy.yml
docs/setup.md, docs/email-client-checklist.md
```

---

### Task 1: Scaffold Worker, SPA build, test harness and CI

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `index.html`, `src/worker/index.ts`, `src/worker/env.ts`, `src/app/main.tsx`, `src/app/App.tsx`, `.dev.vars.example`, `.github/workflows/ci.yml`
- Test: `test/worker/health.test.ts`, `test/app/smoke.test.tsx`

**Interfaces:**
- Produces: `app: Hono<{ Bindings: Env; Variables: { userEmail: string } }>` exported from `src/worker/index.ts`; default export `{ fetch: app.fetch, scheduled }` (scheduled is a no-op stub until Task 11). `Env` interface in `src/worker/env.ts` with every binding/var/secret from Global Constraints. Routing rule: `/admin` and `/admin/*` → `env.ASSETS.fetch(new URL('/index.html', req.url))`; unmatched → `env.ASSETS.fetch(req)`.
- npm scripts: `dev`, `build`, `test` (`vitest run`), `typecheck` (`tsc -b`), `brand`, `contrast`, `deploy`.

- [ ] **Step 1: Write failing tests**

```ts
// test/worker/health.test.ts
it('GET /healthz returns ok', async () => {
  const res = await SELF.fetch('https://news.enhancedgroup.co.uk/healthz');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
// test/app/smoke.test.tsx
it('renders the app shell heading', () => {
  render(<App />);
  expect(screen.getByText('Tech Safety News')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run** `npx vitest run` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement scaffold.** `wrangler.jsonc`: `main: src/worker/index.ts`, `compatibility_date` = today, `compatibility_flags: ["nodejs_compat"]`, `assets: { binding: "ASSETS", run_worker_first: true, not_found_handling: "none" }`, `d1_databases` (`DB`, `migrations_dir: "migrations"`), `r2_buckets` (`MEDIA`), `triggers.crons: ["*/5 * * * *"]`, `vars` with the Global Constraints values (`ACCESS_*` as placeholders `"set-me"`), `routes: [{ pattern: "news.enhancedgroup.co.uk", custom_domain: true }]`. Vitest: `worker` project via `@cloudflare/vitest-pool-workers` (wrangler config, `miniflare.bindings.TEST_MIGRATIONS = await readD1Migrations('migrations')`, setup file applying them with `applyD1Migrations`), `app` project with `environment: 'jsdom'` and `@testing-library/jest-dom`. `ci.yml` on `pull_request`: `npm ci`, `npm run brand`, `npm run contrast`, `npm run typecheck`, `npm test`, `npm run build` on Node 22.
- [ ] **Step 4: Run** `npx vitest run` — Expected: PASS (2 tests). Run `npm run build` — Expected: `dist/` produced without errors.
- [ ] **Step 5: Commit** `git commit -m "chore: scaffold worker, SPA, tests and CI"`

---

### Task 2: D1 schema, settings seed, settings module

**Files:**
- Create: `migrations/0001_init.sql`, `migrations/0002_seed_settings.sql`, `src/worker/db/settings.ts`, `src/worker/clock.ts`
- Test: `test/worker/db-settings.test.ts`

**Interfaces:**
- Produces: tables exactly as spec §5 (plus `webhook_tokens`); all `id` columns `INTEGER PRIMARY KEY AUTOINCREMENT`; `contacts.email` and `suppressions.email` `COLLATE NOCASE`.
- `type Settings = { sender_name: string; phone: string; legal_name: string; company_number: string; registered_office: string; ce_certificate_id: string }`
- `src/worker/clock.ts`: `nowMs(env: Env): number` — `env.TEST_NOW ? Date.parse(env.TEST_NOW) : Date.now()`; every time-dependent route and `runCampaignSend` uses it.
- `getSettings(db: D1Database): Promise<Settings>`; `updateSettings(db: D1Database, patch: Partial<Settings>): Promise<Settings>` (rejects unknown keys).

- [ ] **Step 1: Write failing tests**

```ts
it('seeds Enhanced Group settings', async () => {
  const s = await getSettings(env.DB);
  expect(s.company_number).toBe('13094854');
  expect(s.registered_office).toBe('Unit 43 Dixon Business Centre, Dixon Road, Bristol, BS4 5QW');
  expect(s.phone).toBe('0117 472 9200');
  expect(s.ce_certificate_id).toBe('79f52d13-3d5b-4e58-b17a-7e40adecb563');
});
it('updates a setting and ignores nothing else', async () => {
  const s = await updateSettings(env.DB, { phone: '0117 000 0000' });
  expect(s.phone).toBe('0117 000 0000');
  expect(s.legal_name).toBe('Enhanced Technology Solutions Ltd');
});
it('rejects unknown keys', async () => {
  await expect(updateSettings(env.DB, { nope: 'x' } as any)).rejects.toThrow('Unknown setting: nope');
});
it('treats emails case-insensitively', async () => {
  await env.DB.prepare("INSERT INTO contacts (email, name, created_at, updated_at) VALUES ('A@x.com','A',?,?)").bind(now, now).run();
  await expect(env.DB.prepare("INSERT INTO contacts (email, name, created_at, updated_at) VALUES ('a@X.com','A',?,?)").bind(now, now).run()).rejects.toThrow();
});
```

- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/db-settings.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write migrations and `settings.ts`.**
- [ ] **Step 4: Run same command** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: D1 schema and settings"`

---

### Task 3: Cloudflare Access authentication

**Files:**
- Create: `src/worker/auth.ts`; Modify: `src/worker/index.ts` (mount on `/api/*`)
- Test: `test/worker/auth.test.ts`

**Interfaces:**
- Produces: `createAccessMiddleware(getKeys?: (env: Env) => JWTVerifyGetKey): MiddlewareHandler` — default `getKeys` is `createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`))` cached per isolate. Verifies `Cf-Access-Jwt-Assertion` with `issuer: https://${ACCESS_TEAM_DOMAIN}`, `audience: ACCESS_AUD`; sets `c.set('userEmail', payload.email)`. On failure: `401 { error: "Your session expired — reload to sign in" }`. If `env.DEV_AUTH_BYPASS === 'true'` **and** `ACCESS_AUD === 'set-me'`, sets `userEmail = 'dev@enhancedgroup.co.uk'` (double guard so a deployed config can never bypass).
- Tests use `generateKeyPair('RS256')` + `createLocalJWKSet` injected via `getKeys`.

- [ ] **Step 1: Write failing tests** — `valid token → 200 and handler sees userEmail 'dan@enhancedgroup.co.uk'`; `missing header → 401`; `wrong aud → 401`; `expired → 401`; `DEV_AUTH_BYPASS with real ACCESS_AUD → 401`.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/auth.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `auth.ts`.**
- [ ] **Step 4: Run** — Expected: PASS (5 tests).
- [ ] **Step 5: Commit** `git commit -m "feat: verify Cloudflare Access JWT on /api"`

---

### Task 4: Block schemas, rich text, London time helpers

**Files:**
- Create: `src/shared/blocks.ts`, `src/shared/richtext.ts`, `src/shared/time.ts`
- Test: `test/shared/blocks.test.ts`, `test/shared/richtext.test.ts`, `test/shared/time.test.ts`

**Interfaces:**
- Produces (`blocks.ts`): zod `BlockSchema` discriminated on `type` with fields from spec §7 (every block also has `id: string`); `type Block`; `CampaignContentSchema = { subject: string(1..90), preheader: string(0..140), blocks: Block[] (min 1) }` and `type CampaignContent = z.infer<typeof CampaignContentSchema>`; `CardSchema` (types `scam_alert|tip|warning`). `warningSigns` 1–6 non-empty strings; `image.alt` required non-empty.
- `richtext.ts`: `richToHtml(src: string): string`, `richToText(src: string): string`. Supports `**bold**`, `[text](https://…|tel:…)`, blank-line paragraphs, single line breaks. Escapes `& < > " '`. Links with other schemes render as plain text. Text form of link: `text (url)`.
- `time.ts`: `londonLocalToUtc(local: 'YYYY-MM-DDTHH:mm'): string` (ISO UTC) — throws `Error("That time doesn't exist because the clocks go forward")` for gap times; ambiguous → earlier (BST) instant. `utcToLondonLocal(iso: string): string`. Implement with `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ... })` offset probing (try +0 and +1 offsets, keep candidates that round-trip).

- [ ] **Step 1: Write failing tests**

```ts
expect(richToHtml('Call **now** <b>')).toBe('<p>Call <strong>now</strong> &lt;b&gt;</p>');
expect(richToHtml('[site](javascript:alert(1))')).toBe('<p>site</p>');
expect(richToText('[Action Fraud](https://www.actionfraud.police.uk)')).toBe('Action Fraud (https://www.actionfraud.police.uk)');
expect(BlockSchema.safeParse({ id: 'a', type: 'image', r2Key: 'k', alt: '' }).success).toBe(false);
expect(BlockSchema.safeParse({ id: 'a', type: 'scam_alert', title: 't', looksLike: 'x', warningSigns: [], whatToDo: 'y' }).success).toBe(false);
expect(londonLocalToUtc('2026-07-01T09:00')).toBe('2026-07-01T08:00:00.000Z');
expect(londonLocalToUtc('2026-12-01T09:00')).toBe('2026-12-01T09:00:00.000Z');
expect(londonLocalToUtc('2026-10-25T01:30')).toBe('2026-10-25T00:30:00.000Z'); // ambiguous → BST
expect(() => londonLocalToUtc('2027-03-28T01:30')).toThrow("clocks go forward");
expect(utcToLondonLocal('2026-07-01T08:00:00.000Z')).toBe('2026-07-01T09:00');
```

- [ ] **Step 2: Run** `npx vitest run test/shared` — Expected: FAIL.
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: block schemas, rich text and London time helpers"`

---

### Task 5: Brand assets, colour tokens and contrast gate

**Files:**
- Create: `brand/logo-tile.svg`, `scripts/build-brand.ts`, `scripts/check-contrast.ts`, `src/shared/tokens.ts`, `src/shared/contrast.ts`, `public/site.webmanifest`
- Generated (committed): `public/brand/*`, `public/icons/*`, `public/favicon.ico`, `public/favicon.svg`, `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/og-image.png`
- Test: `test/shared/contrast.test.ts`, `test/shared/brand.test.ts`

**Interfaces:**
- `contrast.ts`: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`.
- `tokens.ts`: `export const themes = { light: {...}, dark: {...} }` — keys: `pageBg, surface, text, textMuted, border, key, accent` plus `alert.{scam|tip|warning}.{cardBg, border, badgeBg, icon, pillBg, pillText, title, body, subhead?}` with the exact hex values from spec §13 "Alert cards"; `ink = { cyan: '#00AEEF', magenta: '#EC008C', yellow: '#FFF200' }`; `logo = { light: { tile: '#0B0B0B', icon: '#FFFFFF' }, dark: { tile: '#FFFFFF', icon: '#0B0B0B' } }`. `export const contrastPairs: Array<{ name: string; fg: string; bg: string; min: 4.5 | 3 }>` covering every text/background and icon/badge pair in both themes.
- Logo geometry (master SVG, viewBox `0 0 48 48`): tile `rect x=2 y=2 w=44 h=44 rx=11.5`; Tabler `shield-search` paths (from `@tabler/icons/icons/outline/shield-search.svg`) scaled to 26px box centred at x=24, y=21.5, stroke-width 2 (Tabler units); bottom strip clipped to tile, `y=38.5 h=7.5`, three equal segments cyan/magenta/yellow.
- `build-brand.ts` writes: `public/brand/logo-mark-{light,dark}.svg`, `public/brand/logo-lockup-{light,dark}.svg` (mark + "Enhanced Group" 500 weight over "Tech Safety News" 400 weight, Inter glyphs converted to paths via `opentype.js` loading `@fontsource/inter/files/inter-latin-{500,400}-normal.woff`), `public/brand/email-logo-{light,dark}-2x.png` (lockup, 2× of 260×52), `favicon.svg` (light mark with `<style>@media (prefers-color-scheme: dark){…dark fills…}</style>`), `favicon.ico` (16/32/48), `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, `og-image.png` 1200×630 (light page bg, lockup centred), and email icons `public/icons/{shield-exclamation,bulb,alert-triangle,phone,shield-check}-{light,dark}-2x.png` — 68×68 px (2× of 34) with the badge circle baked in using that alert's `badgeBg` + `icon` colours (`phone` uses white on key / key on white; `shield-check` uses safe-green without circle).
- `check-contrast.ts`: prints each failing pair and exits 1 if any `contrastRatio(fg,bg) < min`.

- [ ] **Step 1: Write failing tests**

```ts
expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
expect(contrastRatio('#00AEEF', '#FFFFFF')).toBeLessThan(3); // documents why cyan-ink is never text on white
for (const p of contrastPairs) expect(contrastRatio(p.fg, p.bg), p.name).toBeGreaterThanOrEqual(p.min);
// brand.test.ts (runs after `npm run brand`)
expect(pngSize('public/icon-512.png')).toEqual({ width: 512, height: 512 });
expect(pngSize('public/brand/email-logo-light-2x.png')).toEqual({ width: 520, height: 104 });
expect(readFileSync('public/favicon.svg', 'utf8')).toContain('prefers-color-scheme: dark');
```

- [ ] **Step 2: Run** `npx vitest run test/shared/contrast.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement tokens, contrast, master SVG, both scripts.** Run `npm run brand`.
- [ ] **Step 4: Run** `npx vitest run test/shared && npm run contrast` — Expected: PASS, contrast script prints "All N pairs pass".
- [ ] **Step 5: Visually inspect** `public/brand/logo-lockup-light.svg`, `-dark.svg`, `icon-512.png` and one email icon by opening them; the mark must match the approved design (black tile/white shield-search in light, inverse in dark, CMY strip).
- [ ] **Step 6: Commit** `git commit -m "feat: brand assets, colour tokens and contrast gate"`

---

### Task 6: Email renderer

**Files:**
- Create: `src/email/render.tsx`, `src/email/styles.ts`, `src/email/plaintext.ts`, `src/email/components/{Layout,Header,Footer,ScamAlert,Tip,Warning,TextBlock,ImageBlock,CallUs,Divider}.tsx`
- Test: `test/email/render.test.ts`

**Interfaces:**
- Consumes: `Block`, `richToHtml/richToText` (Task 4), `themes`, `ink` (Task 5), `Settings` (Task 2).
- Produces: `renderCampaign(input: RenderInput): Promise<{ html: string; text: string }>` where
  `type RenderInput = { content: CampaignContent; settings: Settings; baseUrl: string; issueDate: string /* ISO */; mode: 'email' | 'web'; recipient?: { name: string; unsubUrl: string; webUrl: string } | 'mailgun' }`.
  `recipient: 'mailgun'` inserts literal `%recipient.name%`, `%recipient.unsub_url%`, `%recipient.web_url%` placeholders; omitted recipient (archive/preview) renders no greeting name and no unsubscribe link.
- Rules (spec §8): React Email `Html/Head/Body/Container/Section/Row/Column/Img/Link/Text` only; header = lockup image pair (`.logo-light` visible, `.logo-dark` hidden with `display:none;max-height:0;overflow:hidden;mso-hide:all` inside `<!--[if !mso]><!-->`) + date + CMY rule (three-cell table, 4px high); cards per §13 tables; icons from `${baseUrl}/icons/{name}-light-2x.png` displayed 34×34 (dark variants swapped by class); call bar `tel:` link with digits only; footer copy exact from Global Constraints; CE badge = spec §8 snippet using `settings.ce_certificate_id`, wrapped in a cell with class `ce-chip` (white bg in dark CSS); `<meta name="color-scheme" content="light dark">`, `<meta name="supported-color-schemes" content="light dark">`; hidden preheader. `styles.ts` exports `darkCss(mode)` — `mode==='email'` emits `@media (prefers-color-scheme: dark)` + `[data-ogsc]`/`[data-ogsb]` rules; `mode==='web'` emits those under `:root:not([data-theme="light"])` and `[data-theme="dark"]` so the archive toggle works.
- `plaintext.ts`: `blocksToText(content, settings, recipient)` — headings uppercased with underline of `=`, warning signs as `- ` bullets, footer lines, `Unsubscribe: {url}` when recipient present.

- [ ] **Step 1: Write failing tests** (fixture: one of each block type)

```ts
const { html, text } = await renderCampaign({ ...fixture, mode: 'email', recipient: { name: "Ann O'Brien <x>", unsubUrl: 'https://news.enhancedgroup.co.uk/u/abc', webUrl: 'https://news.enhancedgroup.co.uk/archive/x' } });
expect(html).toContain('Scam alert'); expect(html).toContain('Tip of the month'); expect(html).toContain('Watch out');
expect(html).toContain('#B0006A'); expect(html).toContain('#006E96'); expect(html).toContain('#FFF8B3');
expect(html).not.toMatch(/<div[^>]*style="[^"]*display:\s*(flex|grid)/);
expect(html).not.toContain('<link rel="stylesheet"');
expect(html).not.toContain('oncontextmenu');
for (const img of html.match(/<img[^>]*>/g)!) { expect(img).toMatch(/alt="[^"]+"/); expect(img).toMatch(/width="\d+"/); expect(img).toMatch(/height="\d+"/); }
expect(html).toContain('Ann O&#x27;Brien &lt;x&gt;'); // or &#39; — assert no raw "<x>"
expect(html).not.toContain('<x>');
expect(text).toContain("Ann O'Brien <x>");
expect(html).toContain('Messages from this service will never ask for your personal information.');
expect(html).toContain('Company no. 13094854');
expect(html).toContain('registry.blockmarktech.com/certificates/79f52d13-3d5b-4e58-b17a-7e40adecb563/email-image/');
expect(html).toContain('href="tel:01174729200"');
expect(html).toContain('prefers-color-scheme: dark');
const web = await renderCampaign({ ...fixture, mode: 'web' });
expect(web.html).not.toContain('/u/'); expect(web.html).toContain('[data-theme="dark"]');
const mg = await renderCampaign({ ...fixture, mode: 'email', recipient: 'mailgun' });
expect(mg.html).toContain('%recipient.unsub_url%');
expect(text).toContain('Unsubscribe: https://news.enhancedgroup.co.uk/u/abc');
```

- [ ] **Step 2: Run** `npx vitest run test/email` — Expected: FAIL.
- [ ] **Step 3: Implement components, styles, plaintext, render.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write `fixture.html` to `dist/preview/` via a one-off `npx tsx scripts/render-fixture.ts` and open it in a browser in light and dark mode; it must match the approved card designs.** (Keep the script — it's reused for manual client testing in Task 18.)
- [ ] **Step 6: Commit** `git commit -m "feat: Outlook-safe light/dark email renderer"`

---

### Task 7: Lists, contacts and CSV import API

**Files:**
- Create: `src/worker/csv.ts`, `src/worker/db/lists.ts`, `src/worker/db/contacts.ts`, `src/worker/routes/api-lists.ts`
- Test: `test/worker/csv.test.ts`, `test/worker/api-lists.test.ts`

**Interfaces:**
- `csv.ts`: `parseContactsCsv(text: string, mapping?: { email: string; name?: string; first?: string; last?: string }): ParseResult` where `ParseResult = { rows: { email: string; name: string }[]; invalid: { line: number; value: string }[]; duplicatesInFile: number; columns: string[]; mapping: {...} | null }`. Strips BOM, papaparse with delimiter auto-detect, header detection per spec §6 (case-insensitive: `Email`, `Email address`, `PrimarySmtpAddress`, `Mail`; name: `Display name`, `DisplayName`, `Name`, or `First name`+`Last name`). Emails trimmed + lowercased; validity `^[^\s@]+@[^\s@]+\.[^\s@]+$`. `mapping: null` + empty rows when no email column found (UI then asks for mapping).
- `diffList(db, listId: number | null, rows): Promise<ImportDiff>`; `ImportDiff = { added: string[]; removed: string[]; unchanged: number; suppressed: string[] }`.
- Routes (all under Access):
  - `GET /api/lists` → `{ lists: { id, name, description, memberCount, updatedAt }[] }`
  - `POST /api/lists/import/preview` body `{ listId?: number; csv: string; mapping? }` → `{ parse: ParseResult; diff: ImportDiff }`
  - `POST /api/lists/import/commit` body `{ listId?: number; name?: string; csv: string; mapping?; removeMissing: boolean }` → `{ listId, diff }` (re-parses server-side; never trusts client rows). New list requires unique `name` (409 "A list with that name already exists").
  - `GET /api/lists/:id/members?q=` → `{ members: { email, name, suppressed: boolean }[] }`
  - `GET /api/lists/:id/export` → `text/csv` with `Email,Name`
  - `DELETE /api/lists/:id` → 204 (contacts kept)

- [ ] **Step 1: Write failing tests**

```ts
const bom = '﻿Display name;Email\nAnn;ANN@x.com\nBob; bob@x.com \nBad;not-an-email\nAnn again;ann@x.com\n';
const r = parseContactsCsv(bom);
expect(r.rows).toEqual([{ email: 'ann@x.com', name: 'Ann' }, { email: 'bob@x.com', name: 'Bob' }]);
expect(r.invalid).toEqual([{ line: 4, value: 'not-an-email' }]);
expect(r.duplicatesInFile).toBe(1);
expect(parseContactsCsv('PrimarySmtpAddress,DisplayName\na@x.com,A\n').rows[0]).toEqual({ email: 'a@x.com', name: 'A' });
expect(parseContactsCsv('First name,Last name,Mail\nAnn,Lee,a@x.com\n').rows[0].name).toBe('Ann Lee');
expect(parseContactsCsv('foo,bar\n1,2\n').mapping).toBeNull();
// api: import new list, re-import with one removed + one added, removeMissing true → diff { added:['c@x.com'], removed:['a@x.com'], unchanged:1 }
// api: suppressed address appears in diff.suppressed and members[].suppressed === true
// api: duplicate list name → 409
```

- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/csv.test.ts test/worker/api-lists.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Writes in `commit` use one `db.batch([...])`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: contact lists with O365 CSV import and diff preview"`

---

### Task 8: Suppressions and recipient resolution

**Files:**
- Create: `src/worker/db/suppressions.ts`, `src/worker/recipients.ts`, `src/worker/routes/api-suppressions.ts`
- Test: `test/worker/recipients.test.ts`, `test/worker/api-suppressions.test.ts`

**Interfaces:**
- `addSuppression(db, email: string, reason: 'unsubscribed'|'bounced'|'complained'|'manual', campaignId?: number): Promise<void>` — idempotent; never downgrades (`unsubscribed`/`complained` are not overwritten by `bounced`/`manual`).
- `removeSuppression(db, email, note: string): Promise<void>` — throws `Error('Unsubscribes and complaints can't be removed')` for those reasons.
- `resolveRecipients(db, listIds: number[]): Promise<{ recipients: { contactId: number; email: string; name: string }[]; duplicatesRemoved: number; suppressed: number }>`
- Routes: `GET /api/suppressions` → `{ suppressions: { email, reason, createdAt, campaignId }[] }`; `POST /api/suppressions` `{ email }` (manual); `DELETE /api/suppressions/:email` `{ note }` → 204 / 409 with the error message; `POST /api/recipients/count` `{ listIds }` → resolveRecipients minus the `recipients` array plus `count`.

- [ ] **Step 1: Write failing tests** — person on 2 lists counted once (`duplicatesRemoved: 1`); suppressed member excluded (`suppressed: 1`); `bounced` after `unsubscribed` keeps reason `unsubscribed`; removing `complained` → 409; removing `bounced` with note → 204 and recipient included again.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/recipients.test.ts test/worker/api-suppressions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: suppressions and recipient resolution"`

---

### Task 9: Campaigns, cards, preview, media and settings API

**Files:**
- Create: `src/worker/db/campaigns.ts`, `src/worker/db/cards.ts`, `src/worker/routes/api-campaigns.ts`, `src/worker/routes/api-cards.ts`, `src/worker/routes/api-media.ts`, `src/worker/routes/media.ts`, `src/worker/routes/api-settings.ts`, `src/shared/api-types.ts`
- Test: `test/worker/api-campaigns.test.ts`, `test/worker/api-cards.test.ts`, `test/worker/api-media.test.ts`

**Interfaces:**
- `type CampaignStatus = 'draft'|'scheduled'|'sending'|'sent'|'failed'`; `CampaignDto = { id, subject, preheader, blocks, status, listIds: number[], scheduledAt: string|null, sentAt, testSentAt, hideFromArchive: boolean, slug, updatedAt, lastError }` (in `api-types.ts`).
- Routes:
  - `GET /api/campaigns` → `{ campaigns: CampaignDto[] }` (newest first, blocks omitted)
  - `POST /api/campaigns` `{ subject?, duplicateOf?: number }` → `CampaignDto` (`draft`; duplicate copies content + lists, clears dates)
  - `GET /api/campaigns/:id` → `CampaignDto`
  - `PUT /api/campaigns/:id` `{ subject, preheader, blocks, listIds, hideFromArchive }` → validates with `CampaignContentSchema` **except** `blocks` may be empty while drafting; bumps `updated_at`; 409 `"This email has already been sent"` / `"This email is sending"` when status is `sending`/`sent`; editing a `scheduled` campaign reverts it to `draft` (must re-schedule after a new test).
  - `POST /api/campaigns/:id/schedule` `{ local: 'YYYY-MM-DDTHH:mm' }` → uses `londonLocalToUtc`; 400 if < now + 5 min (`"Pick a time at least 5 minutes from now"`) or gap time; requires preflight pass (Task 10 `preflight`) — until Task 10 lands, stub returns ok; → status `scheduled`.
  - `POST /api/campaigns/:id/unschedule` → `draft`.
  - `DELETE /api/campaigns/:id` → only `draft`/`failed`.
  - `POST /api/preview` `{ content, mode?: 'email' }` → `{ html, text }` via `renderCampaign` with sample recipient `{ name: 'Margaret', unsubUrl: '#', webUrl: '#' }`.
  - Cards: `GET /api/cards?q=` (title LIKE), `POST /api/cards` `{ type, title, data }` validated by `CardSchema`, `DELETE /api/cards/:id`, `POST /api/cards/:id/used` (sets `last_used_at`).
  - Media: `POST /api/media` (raw body, `Content-Type` `image/png|image/jpeg`, ≤ 2 MB) → `{ key, url }` with key `img/{yyyy}/{mm}/{uuid}.{ext}`; 415/413 with friendly messages. Public `GET /media/:key{.+}` streams from R2 with `Cache-Control: public, max-age=31536000, immutable`.
  - Settings: `GET /api/settings`, `PUT /api/settings` (Task 2 functions).

- [ ] **Step 1: Write failing tests** — create → update → get round-trips blocks; PUT on `sent` → 409; PUT on `scheduled` → status becomes `draft`; schedule `'2027-03-28T01:30'` → 400 containing "clocks go forward"; schedule 2 minutes ahead → 400; duplicate copies blocks and listIds with status `draft`; preview returns html containing "Margaret"; media 3 MB → 413, `image/gif` → 415, valid PNG → key matches `/^img\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/` and `GET /media/{key}` returns same bytes; card with invalid data → 400.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/api-campaigns.test.ts test/worker/api-cards.test.ts test/worker/api-media.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Time comes from `nowMs(c.env)` (Task 2); tests call `app.request(url, init, { ...env, TEST_NOW: '2026-11-02T08:00:00.000Z' })`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: campaigns, card library, preview, media and settings API"`

---

### Task 10: Mailgun client, preflight and test send

**Files:**
- Create: `src/worker/mailgun.ts`, `src/worker/tokens.ts`, `src/worker/send.ts` (preflight + test send part)
- Modify: `src/worker/routes/api-campaigns.ts` (add test-send, preflight; replace schedule stub)
- Test: `test/worker/mailgun.test.ts`, `test/worker/tokens.test.ts`, `test/worker/preflight.test.ts`

**Interfaces:**
- `mailgun.ts`: `createMailgun(env: Env, senderName: string, fetchImpl = fetch)` returning `{ sendBatch(msg: MailgunMessage): Promise<{ id: string }>, domainVerified(): Promise<boolean> }`. `MailgunMessage = { to: string[]; subject: string; html: string; text: string; recipientVariables?: Record<string, Record<string,string>>; headers?: Record<string,string>; variables?: Record<string,string>; testMode?: boolean }`. POSTs `multipart/form-data` to `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/messages` with Basic auth `api:${MAILGUN_API_KEY}`; `from` = `"${senderName}" <${SENDER_ADDRESS}>` (callers pass `settings.sender_name`); adds `o:tracking-clicks=no`, `o:tracking-opens=yes`; headers as `h:Name`, variables as `v:name`. Non-2xx → throws `MailgunError(status, bodyText)`. `domainVerified` = `GET /v4/domains/${MAILGUN_DOMAIN}` → `domain.state === 'active'` and every `sending_dns_records[].valid === 'valid'`.
- `tokens.ts`: `signUnsubToken(secret: string, payload: { sendId: number } | { test: number /* campaignId */ }): Promise<string>`; `verifyUnsubToken(secret, token): Promise<{ sendId: number } | { test: number } | null>`. Format `base64url(JSON) + '.' + base64url(HMAC-SHA256)`; constant-time compare via `crypto.subtle.verify`.
- `send.ts`: `preflight(env, campaignId): Promise<{ ok: true; recipients: number } | { ok: false; reasons: string[] }>` reasons (exact): `"Mailgun hasn't verified news.enhancedgroup.co.uk yet"`, `"Send yourself a test after your latest changes"`, `"Add a subject"`, `"Add at least one block"`, `"Fix the highlighted blocks"`, `"Pick at least one list with people on it"`. `sendTest(env, campaignId, to: string): Promise<void>` — subject prefixed `[TEST] `, recipient name "Test", unsub token `{ test: campaignId }`, sets `test_sent_at` = now.
- Routes: `GET /api/campaigns/:id/preflight` → preflight result; `POST /api/campaigns/:id/test` `{ to?: string }` (default `c.get('userEmail')`) → 204; `/schedule` now 400 `{ reasons }` when preflight fails.

- [ ] **Step 1: Write failing tests** — mock fetch captures FormData: `from === '"Enhanced Group Tech Safety" <noreply@news.enhancedgroup.co.uk>'`, `o:tracking-clicks === 'no'`, URL starts `https://api.eu.mailgun.net/v3/news.enhancedgroup.co.uk/messages`, no `h:Reply-To`; 500 response throws `MailgunError`; token round-trip, tampered token → null, test token → `{ test: 7 }`; preflight on campaign edited after test → reasons includes "Send yourself a test after your latest changes"; unverified domain → reasons includes Mailgun message; test send sets `testSentAt` and subject `[TEST] …`.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/mailgun.test.ts test/worker/tokens.test.ts test/worker/preflight.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: Mailgun client, preflight checks and test sends"`

---

### Task 11: Campaign sending, scheduler and retry

**Files:**
- Modify: `src/worker/send.ts` (add `runCampaignSend`), `src/worker/routes/api-campaigns.ts`
- Create: `src/worker/scheduled.ts`, `src/worker/db/sends.ts`
- Test: `test/worker/send.test.ts`, `test/worker/scheduled.test.ts`

**Interfaces:**
- `runCampaignSend(env: Env, campaignId: number, sentBy: string, opts?: { retryOnly?: boolean }): Promise<{ status: 'sent' | 'failed' | 'skipped'; accepted: number; pending: number }>`:
  1. Claim: `UPDATE campaigns SET status='sending', updated_at=? WHERE id=? AND status IN ('draft','scheduled')` (or `('failed')` when `retryOnly`); 0 rows → `skipped`.
  2. Run `preflight` (scheduling already required it to pass, and any edit reverts a scheduled campaign to draft, so it passes unless Mailgun verification lapsed); on failure → status `failed`, `last_error` = reasons joined by "; ".
  3. Unless `retryOnly`: `resolveRecipients` → `INSERT OR IGNORE` `sends` rows `pending`.
  4. Chunk pending rows by `MAILGUN_BATCH_SIZE`; per chunk render once with `recipient: 'mailgun'`, `recipientVariables[email] = { name, unsub_url, web_url, send_id }`, `headers = { 'List-Unsubscribe': '<%recipient.unsub_url%>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }`, `variables = { send_id: '%recipient.send_id%' }`; on success mark chunk `accepted` with message id; on `MailgunError` stop, set campaign `failed`, `last_error` = `"Mailgun error {status}: {first 200 chars}"`.
  5. All accepted → `sent`, `sent_at`, `sent_by`, `slug = {yyyy}-{mm}-{slugified subject}` (suffix `-2`, `-3` on clash).
- Routes: `POST /api/campaigns/:id/send` → 200 `{ status, accepted, pending }` — runs inline (no `waitUntil`) so the response reports the real result; lists are small; `POST /api/campaigns/:id/retry` → `runCampaignSend(..., { retryOnly: true })`.
- `scheduled.ts`: `handleScheduled(env, now = Date.now())` — selects `scheduled` campaigns with `scheduled_at <= now`, runs each sequentially; deletes `webhook_tokens` older than 1 hour.

- [ ] **Step 1: Write failing tests** — 2,500 recipients with batch size 1000 → 3 Mailgun calls, all `sends` `accepted`, campaign `sent` with slug `2026-11-fake-parcel-texts`; two concurrent `runCampaignSend` calls → exactly one non-`skipped` and Mailgun called 3 times total; second batch returns 500 → campaign `failed`, 1000 accepted / 1500 pending, then `retry` with healthy mock → 2 more calls and `sent`; recipient name `"Smith, Ann" <b>` survives `JSON.parse(form.get('recipient-variables'))`; `handleScheduled` at 09:05 sends a campaign scheduled 09:00 and ignores one scheduled 09:10.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/send.test.ts test/worker/scheduled.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement; wire `scheduled` export in `src/worker/index.ts` to `handleScheduled`.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: batched campaign sending, scheduler and retry"`

---

### Task 12: Unsubscribe pages

**Files:**
- Create: `src/worker/routes/unsubscribe.ts`, `src/worker/pages/simple-page.ts` (shared branded HTML shell: logo pair, light/dark, 20px body)
- Test: `test/worker/unsubscribe.test.ts`

**Interfaces:**
- `GET /u/:token` → 200 page: heading "Stop receiving Tech Safety News?", one `<form method="post">` with button "Unsubscribe". Never writes to the DB.
- `POST /u/:token` (form or `List-Unsubscribe=One-Click` body) → `addSuppression(email, 'unsubscribed', campaignId)`, `sends.unsubscribed_at = now`; page "You've been unsubscribed. If this was a mistake, call us on {phone}."
- Test token → page "This is a test email — nothing was changed" (GET and POST).
- Invalid token → 400 page "This link isn't valid. If you need help, call us on {phone}."
- `simplePage(opts: { title: string; bodyHtml: string; settings: Settings }): string`.

- [ ] **Step 1: Write failing tests** — GET does not create a suppression; POST does and is idempotent (second POST still 200); one-click POST with body `List-Unsubscribe=One-Click` works; test token POST changes nothing; garbage token → 400 containing `0117 472 9200`.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/unsubscribe.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: scanner-safe unsubscribe with one-click support"`

---

### Task 13: Mailgun webhooks and stats

**Files:**
- Create: `src/worker/routes/webhooks.ts`, `src/worker/routes/api-status.ts`; Modify: `src/worker/db/sends.ts`
- Test: `test/worker/webhooks.test.ts`, `test/worker/api-status.test.ts`

**Interfaces:**
- `POST /webhooks/mailgun` (JSON body `{ signature: { timestamp, token, signature }, 'event-data': {...} }`): verify HMAC-SHA256(`MAILGUN_WEBHOOK_SIGNING_KEY`, timestamp+token) hex → else 401; `|now - timestamp| > 300s` → 401; `INSERT INTO webhook_tokens` conflict → 200 `{ ignored: 'replay' }`. Read `event-data['user-variables'].send_id`; missing/unknown → 200 `{ ignored: 'unknown send' }`. Event mapping exactly per spec §10 (`failed` only when `severity === 'permanent'`; temporary → 200 ignored).
- `GET /api/campaigns/:id/stats` → `{ sent, delivered, opened, bounced, complained, unsubscribed, problems: { email, status, error }[] }`.
- `GET /api/status` → `{ mailgunVerified: boolean, nextScheduled: { id, subject, scheduledAt } | null, lastSent: { id, subject, sentAt, stats } | null }`.

- [ ] **Step 1: Write failing tests** — bad signature → 401; stale timestamp → 401; replayed token → 200 ignored and no double count; `delivered` sets status; `opened` twice keeps first `opened_at`; permanent `failed` adds `bounced` suppression; temporary `failed` → no change; `complained` adds suppression; missing `send_id` → 200 ignored; stats counts match.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/webhooks.test.ts test/worker/api-status.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: Mailgun webhooks, suppression updates and stats"`

---

### Task 14: Public archive

**Files:**
- Create: `src/worker/routes/archive.ts`; Modify: `src/worker/pages/simple-page.ts` (theme toggle script + OG tags)
- Test: `test/worker/archive.test.ts`

**Interfaces:**
- `GET /` → archive index of `sent` campaigns with `hide_from_archive = 0`, newest first: subject (link to `/archive/{slug}`), London date, first `scam_alert` title. Empty state: "No alerts published yet."
- `GET /archive/:slug` → `renderCampaign({ mode: 'web' })` HTML with injected toggle button (Tabler sun/moon SVG inline, `aria-label="Switch to dark mode"`/`"Switch to light mode"`) that sets `data-theme` on `<html>` and stores choice in `localStorage` inside try/catch; footer Blockmark iframe exactly per spec §12 with `title="Cyber Essentials Plus certificate"` inside a `.ce-panel` (white bg in dark). Hidden or unsent → 404 page.
- Both pages: `<meta property="og:image" content="{base}/og-image.png">`, `og:title`, `og:description`; header `Content-Security-Policy: default-src 'self'; img-src 'self' https://registry.blockmarktech.com data:; frame-src https://registry.blockmarktech.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'`.

- [ ] **Step 1: Write failing tests** — index lists only sent + visible campaigns in date order; hidden campaign → 404 on its slug; draft slug → 404; page contains iframe src with certificate id and `title=`; CSP header contains `frame-src https://registry.blockmarktech.com`; page contains `og:image`; page has no `/u/` link.
- [ ] **Step 2: Run** `npx vitest run --project worker test/worker/archive.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: public archive with light/dark toggle"`

---

### Task 15: Admin shell, theme, API client, dashboard and settings

**Files:**
- Create: `src/app/theme.ts`, `src/app/api.ts`, `src/app/styles.css`, `src/app/components/{Layout,Banner,Button,Field}.tsx`, `src/app/pages/{Dashboard,Settings}.tsx`; Modify: `src/app/App.tsx`, `src/app/main.tsx`, `index.html` (favicon links, manifest, theme-color)
- Test: `test/app/theme.test.tsx`, `test/app/dashboard.test.tsx`

**Interfaces:**
- `theme.ts`: `getStoredTheme(): 'light'|'dark'|null`, `setTheme(t: 'light'|'dark'|'system'): void`, `applyTheme(): void` — writes every `themes[mode]` token as `--tsn-*` CSS variables on `document.documentElement` and sets `data-theme`; all `localStorage` access in try/catch.
- `api.ts`: `api<T>(path: string, init?: RequestInit): Promise<T>` — JSON in/out, throws `ApiError(status, message)` using the response `error` field; on 401 dispatches `window` event `'tsn:session-expired'`.
- Layout: left nav (Tabler icons: `layout-dashboard`, `mail`, `books`, `users`, `ban`, `settings`) labelled Dashboard, Emails, Card library, Lists, Suppressions, Settings; header shows logo lockup (swaps by theme) and theme toggle; session-expired listener shows Banner "Your session expired — reload to sign in" with a Reload button.
- Dashboard uses `GET /api/status`: danger Banner "Mailgun hasn't verified news.enhancedgroup.co.uk yet — sending is switched off" when `mailgunVerified` false; next scheduled card; last sent stats card.
- Settings page edits the six settings keys via `PUT /api/settings`.

- [ ] **Step 1: Write failing tests** — `setTheme('dark')` sets `data-theme="dark"` and `--tsn-page-bg` to dark value; works when `localStorage.setItem` throws; Dashboard with `mailgunVerified:false` shows the danger banner text; dispatching `tsn:session-expired` shows the session banner.
- [ ] **Step 2: Run** `npx vitest run --project app` — Expected: FAIL.
- [ ] **Step 3: Implement.** Body text 16px in admin, focus rings visible, all colours via `--tsn-*` variables.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: admin shell with light/dark theme, dashboard and settings"`

---

### Task 16: Admin lists, import wizard and suppressions

**Files:**
- Create: `src/app/pages/{Lists,ListImport,ListMembers,Suppressions}.tsx`
- Test: `test/app/list-import.test.tsx`, `test/app/suppressions.test.tsx`

**Interfaces:**
- Consumes: Task 7 and Task 8 routes.
- ListImport flow: choose "New list" (name input) or existing list → pick `.csv` file (read with `File.text()`) → `preview` → if `parse.mapping === null` show column `<select>`s for email/name from `parse.columns` and re-preview → summary line exactly `+{added} new, −{removed} not in file, {unchanged} unchanged, {invalid} invalid, {suppressed} suppressed` with expandable invalid rows (line numbers) and a "Remove people not in this file" checkbox (default checked; hidden for new lists) → "Save list" → commit → navigate to members.
- Suppressions: table with reason badges; "Remove" only on `bounced`/`manual` rows, opens a confirm dialog requiring a note.

- [ ] **Step 1: Write failing tests** — with mocked `fetch`, uploading a file shows the summary text `+2 new, −1 not in file, 3 unchanged, 1 invalid, 0 suppressed`; unmapped CSV shows column selects; Suppressions renders no Remove button for an `unsubscribed` row and one for a `bounced` row.
- [ ] **Step 2: Run** `npx vitest run --project app test/app/list-import.test.tsx test/app/suppressions.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: list import wizard and suppressions UI"`

---

### Task 17: Editor, card library, emails list, send dialog and stats

**Files:**
- Create: `src/app/pages/{Emails,Editor,Library,CampaignStats}.tsx`, `src/app/editor/{BlockList,BlockForm,ScamAlertForm,TipForm,WarningForm,TextForm,ImageForm,CallUsForm,Preview,SendDialog,useAutosave}.tsx`
- Test: `test/app/editor.test.tsx`, `test/app/send-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 9, 10, 11, 13 routes; `BlockSchema` for client-side validation; `utcToLondonLocal`.
- Emails page: tabs Drafts / Scheduled / Sent; "New email"; "Duplicate" per row; status badge.
- Library page: card list (type badge, title, last used) with search box and Delete; cards are created only from the editor.
- Editor: subject + preheader inputs with character counters (90 / 140); BlockList with Add menu (Scam alert, Tip, Warning, Text, Image, Call-us bar, Divider), per-block Move up / Move down / Duplicate / Delete buttons (no drag-and-drop), "Save to library" on scam_alert/tip/warning, "Insert from library" dialog with search; invalid blocks highlighted with the zod message; `useAutosave(campaign, 1500ms debounce)` → `PUT`, shows "Saved" / "Saving…" / error; Preview iframe (`srcdoc` from `POST /api/preview`, debounced 800ms) with Desktop/Mobile (600 / 375 px) and Light/Dark toggles (dark sets `color-scheme: dark` on the iframe's root so the email's media query applies). ImageForm uploads after client-side resize to max width 1200 via `<canvas>` (`toBlob('image/jpeg', 0.85)` unless PNG with transparency → PNG) and requires alt text.
- SendDialog: list checkboxes → `POST /api/recipients/count` → line `"{count} people · {duplicatesRemoved} duplicates removed · {suppressed} suppressed"`; "Send test to me" button; shows preflight `reasons` as a checklist; "Send now" and "Schedule" (date + time inputs, London) buttons enabled only when preflight ok; confirm step "Send to {count} people?" → `POST /send` or `/schedule`.
- CampaignStats: metric tiles (Sent, Delivered, Opened — label "Opened (estimate — some email apps hide opens)", Bounced, Complained, Unsubscribed) and problems table.

- [ ] **Step 1: Write failing tests** — adding a Scam alert then Tip then pressing Move up on Tip puts Tip first; empty warning sign shows the validation message; typing in subject triggers one PUT after debounce (fake timers); SendDialog with preflight reasons `["Send yourself a test after your latest changes"]` shows that text and Send now is disabled; with ok preflight, confirm text reads `Send to 182 people?`.
- [ ] **Step 2: Run** `npx vitest run --project app test/app/editor.test.tsx test/app/send-dialog.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Run the app locally** (`npm run dev`, `.dev.vars` with `DEV_AUTH_BYPASS=true`), create an email with all block types, check preview in all four toggle combinations, import a sample CSV, and confirm the send dialog flow up to (not including) a real send.
- [ ] **Step 6: Commit** `git commit -m "feat: email editor, card library, send dialog and stats"`

---

### Task 18: Deployment pipeline, setup guide and email-client checklist

**Files:**
- Create: `.github/workflows/deploy.yml`, `docs/setup.md`, `docs/email-client-checklist.md`, `README.md`
- Test: workflow lint via `npx --yes @action-validator/cli .github/workflows/*.yml` (or `actionlint` if available)

**Interfaces:**
- `deploy.yml`: on push to `main`: Node 22, `npm ci`, `npm run brand`, `npm run contrast`, `npm run typecheck`, `npm test`, `npm run build`, then `cloudflare/wrangler-action` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, commands `d1 migrations apply DB --remote` then `deploy`. `concurrency: production` (no overlapping deploys).
- `docs/setup.md`: spec §15 steps 1–8 as numbered, click-by-click instructions, including the exact Mailgun route expression `match_recipient(".*@news.enhancedgroup.co.uk")` → `stop()`, the webhook URL `https://news.enhancedgroup.co.uk/webhooks/mailgun`, `wrangler secret put` commands, and where to paste `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` in `wrangler.jsonc`.
- `docs/email-client-checklist.md`: matrix of clients from spec §17 × {light, dark} × {images on, off}, plus the **List-Unsubscribe substitution check**: send a real batch to two internal addresses and confirm each message's `List-Unsubscribe` header contains its own `/u/` token; if Mailgun did not substitute, set `MAILGUN_BATCH_SIZE` to `"1"` in `wrangler.jsonc` (per-recipient sends) and re-test.

- [ ] **Step 1: Write the three docs and the workflow.**
- [ ] **Step 2: Validate workflows** — Run the validator command above. Expected: no errors.
- [ ] **Step 3: Full local gate** — Run `npm run brand && npm run contrast && npm run typecheck && npm test && npm run build`. Expected: all pass.
- [ ] **Step 4: Commit** `git commit -m "docs: setup guide, client checklist and deploy workflow"`
