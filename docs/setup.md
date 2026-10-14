# Tech Safety News — one-time setup

Follow these steps in order. Each one only needs doing once. Values in `<angle brackets>` are yours to fill in.

## 1. Microsoft Entra ID (sign-in for staff)

1. Azure portal → **Microsoft Entra ID → App registrations → New registration**.
2. Name: `Cloudflare Access`. Supported accounts: *this organisation only*.
3. Redirect URI (Web): `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback`.
4. After creating it, note the **Application (client) ID** and **Directory (tenant) ID**.
5. **Certificates & secrets → New client secret** — copy the secret *value*.
6. **API permissions** → add Microsoft Graph delegated `email`, `openid`, `profile`, `offline_access`, `User.Read`, `GroupMember.Read.All` → **Grant admin consent**.
7. **Groups → New group** (Security): `Newsletter Editors`. Add the staff who may send emails.

## 2. Cloudflare Zero Trust (Access)

1. Cloudflare dashboard → **Zero Trust → Settings → Authentication → Login methods → Add new → Azure AD**.
   Paste the client ID, client secret and tenant ID from step 1. Turn on **Support groups**. Save and **Test**.
2. **Access → Applications → Add an application → Self-hosted**.
   - Name: `Tech Safety News admin`
   - Domains: `news.enhancedgroup.co.uk/admin` **and** `news.enhancedgroup.co.uk/api`
   - Identity provider: the Azure AD login method only.
3. Add a policy: **Allow** → Include → *Azure AD groups* → `Newsletter Editors`.
4. Open the application's **Overview** and copy the **Application Audience (AUD) Tag**.
5. In `wrangler.jsonc`, set:
   ```jsonc
   "ACCESS_TEAM_DOMAIN": "<your-team>.cloudflareaccess.com",
   "ACCESS_AUD": "<the AUD tag>"
   ```
   (While `ACCESS_AUD` is `set-me`, the API refuses every request in production.)

The public pages — `/`, `/archive/*`, `/u/*` (unsubscribe), `/media/*` and `/webhooks/mailgun` — must stay **outside** the Access application.

## 3. Mailgun (EU region)

1. Mailgun → **Sending → Domains → Add new domain**: `news.enhancedgroup.co.uk`, region **EU**.
2. Mailgun shows DNS records. In Cloudflare DNS for `enhancedgroup.co.uk`, add each one exactly (SPF TXT, DKIM TXT, MX, tracking CNAME). Set the CNAME to **DNS only** (grey cloud).
3. Click **Verify DNS settings** in Mailgun and wait until every record shows a green tick.
   > `enhancedgroup.co.uk` has DMARC `p=reject`, which also applies to `news.`. Until DKIM verifies, every email will be silently rejected.
4. **Sending → Domain settings → Sending keys → Add sending key** — this is `MAILGUN_API_KEY`.
5. **Send → Webhooks** → copy the **HTTP webhook signing key** — this is `MAILGUN_WEBHOOK_SIGNING_KEY`.
6. Add a webhook URL `https://news.enhancedgroup.co.uk/webhooks/mailgun` for: *Delivered*, *Opened*, *Permanent failure*, *Spam complaints*, *Unsubscribes*.
7. **Receiving → Create route** so replies are quietly discarded:
   - Expression type: *Custom*, expression: `match_recipient(".*@news.enhancedgroup.co.uk")`
   - Action: `stop()`

With a sending key the app can't read the domain's verification status, so the dashboard shows a notice instead. Always check your test email arrives before sending.

## 4. Email security gateway

Inbound mail for `enhancedgroup.co.uk` passes through `emailsecurity.app` before Office 365. Allow-list mail from `news.enhancedgroup.co.uk` (Mailgun EU) so internal test sends arrive.

## 5. Cloudflare resources

Run these from the project folder (sign in first with `npx wrangler login`):

```bash
npx wrangler d1 create tech-safety-news
```

Copy the printed `database_id` into `wrangler.jsonc` (replace the all-zeros placeholder).

```bash
npx wrangler r2 bucket create tech-safety-news-media
```

The custom domain `news.enhancedgroup.co.uk` is created automatically on first deploy (it's in `wrangler.jsonc` → `routes`).

## 6. Secrets

Production secrets (each command prompts for the value — paste it, nothing is echoed):

```bash
npx wrangler secret put MAILGUN_API_KEY
npx wrangler secret put MAILGUN_WEBHOOK_SIGNING_KEY
npx wrangler secret put UNSUB_SECRET
```

`UNSUB_SECRET` can be any long random string; keep it stable (changing it breaks unsubscribe links in emails already sent).

For local development, copy `example.dev.vars` to `.dev.vars` and fill it in. `.dev.vars` is git-ignored.

GitHub → repository → **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — create at Cloudflare → *My Profile → API Tokens* with **Workers Scripts: Edit**, **D1: Edit**, **Workers R2 Storage: Edit**, **Zone → Workers Routes: Edit** (zone `enhancedgroup.co.uk`).
- `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard sidebar.

Never commit any key to the repository.

## 7. First deploy

Push to `main` (or run the **Deploy** workflow manually). It runs the checks, applies D1 migrations and deploys.

## 8. Settings and first send

1. Open `https://news.enhancedgroup.co.uk/admin` and sign in with Microsoft.
2. **Settings**: check the sender name, phone number, company details and Cyber Essentials certificate ID.
3. **Lists**: import your first Office 365 export.
4. Before the first real send, work through `docs/email-client-checklist.md`.
