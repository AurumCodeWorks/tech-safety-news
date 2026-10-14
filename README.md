# Tech Safety News

Enhanced Group's one-way newsletter of scam alerts and tech-safety tips, built as a single Cloudflare Worker:

- **Admin app** (React) at `/admin`, behind Cloudflare Access (Microsoft sign-in).
- **Public archive** at `/`, unsubscribe pages at `/u/…`.
- **Email sending** through Mailgun (EU), with scheduling, test sends, bounce and complaint handling.
- Outlook-safe, light/dark email template with Scam alert, Tip and Warning cards.

## Develop

```bash
npm install
cp example.dev.vars .dev.vars        # then fill in values
npx wrangler d1 migrations apply DB --local
npm run dev                          # http://localhost:5173/admin
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm test` | Worker, email, shared and app tests |
| `npm run typecheck` | TypeScript checks |
| `npm run brand` | Regenerates logos, favicons and email icons from `scripts/build-brand.ts` |
| `npm run contrast` | Fails if any colour pair drops below WCAG AA |
| `npx tsx scripts/render-fixture.ts` | Writes a sample email to `dist/preview/` |

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` (checks → D1 migrations → `wrangler deploy`). One-time setup — Entra ID, Access, Mailgun, DNS, secrets — is in [docs/setup.md](docs/setup.md). Check emails in real clients with [docs/email-client-checklist.md](docs/email-client-checklist.md).

Design: [spec](docs/superpowers/specs/2026-10-14-tech-safety-news-design.md) · [plan](docs/superpowers/plans/2026-10-14-tech-safety-news.md).
