import type { Settings } from '../worker/db/settings';

// Exact footer copy from the spec (§8). Shared by the HTML and plain-text renderers.
export const NEVER_ASK = 'Messages from this service will never ask for your personal information.';

export const oneWayNotice = (phone: string) =>
  `This is a news-only email — replies aren’t read. If you’re worried about something, call us on ${phone}.`;

export const legalLine = (s: Settings) => `${s.legal_name} · Company no. ${s.company_number} · Registered office: ${s.registered_office}`;

export const footerLines = (s: Settings) => [NEVER_ASK, oneWayNotice(s.phone), legalLine(s)];
