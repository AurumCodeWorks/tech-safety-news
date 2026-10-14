# Email client checklist (before the first live send)

Send a **test** from the editor to a mailbox in each client below, then tick every cell. Repeat after any change to the email template.

To check layout without sending, run `npx tsx scripts/render-fixture.ts` and open `dist/preview/fixture-email.html` (light) and `fixture-email-dark.html` (dark).

| Client | Light, images on | Light, images off | Dark, images on | Dark, images off |
|---|---|---|---|---|
| Classic Outlook desktop (Microsoft 365, 2019, 2016) — Windows | ☐ | ☐ | n/a (always light) | n/a |
| New Outlook for Windows | ☐ | ☐ | ☐ | ☐ |
| Outlook.com (web) | ☐ | ☐ | ☐ | ☐ |
| Outlook for iOS / Android | ☐ | ☐ | ☐ | ☐ |
| Gmail (web) | ☐ | ☐ | ☐ | ☐ |
| Gmail (Android) | ☐ | ☐ | ☐ | ☐ |
| Apple Mail (macOS) | ☐ | ☐ | ☐ | ☐ |
| Apple Mail (iPhone / iPad) | ☐ | ☐ | ☐ | ☐ |

For each, check:

- Logo, date and the cyan/magenta/yellow rule show; in dark mode the logo swaps to the white tile.
- Scam alert (magenta), tip (cyan) and warning (yellow) cards are readable; with images off, the labels "Scam alert", "Tip of the month" and "Watch out" still explain each card.
- The "Call us" bar is tappable on phones and dials 0117 472 9200.
- The footer shows the reassurance line, the one-way notice, company number and registered office, and the Cyber Essentials Plus badge (badge loads from the registry).
- "View in browser" opens the archive page; "Unsubscribe" opens a page with a button (it must **not** unsubscribe until the button is pressed).
- Text is at least as large as normal body text on a phone, and nothing scrolls sideways.

## List-Unsubscribe header check

Mailgun must substitute each recipient's own unsubscribe link into the email headers.

1. Create a list with two internal addresses and send a real (non-test) email to it.
2. In each received message, view the original source / message headers.
3. Confirm `List-Unsubscribe: <https://news.enhancedgroup.co.uk/u/…>` is present and the token differs between the two messages, and that `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is present.
4. If the header shows a literal `%recipient.unsub_url%`, set `"MAILGUN_BATCH_SIZE": "1"` in `wrangler.jsonc` (one API call per person — fine for small lists), deploy and repeat.
