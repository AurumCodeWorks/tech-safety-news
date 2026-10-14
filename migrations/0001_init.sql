CREATE TABLE lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE list_members (
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (list_id, contact_id)
);

CREATE TABLE suppressions (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'complained', 'manual')),
  campaign_id INTEGER NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('scam_alert', 'tip', 'warning')),
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT NULL
);

CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL DEFAULT '',
  preheader TEXT NOT NULL DEFAULT '',
  blocks TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at TEXT NULL,
  sent_at TEXT NULL,
  test_sent_at TEXT NULL,
  hide_from_archive INTEGER NOT NULL DEFAULT 0,
  slug TEXT NULL UNIQUE,
  created_by TEXT NOT NULL,
  sent_by TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT NULL
);

CREATE TABLE campaign_lists (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, list_id)
);

CREATE TABLE sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id INTEGER NULL REFERENCES contacts(id) ON DELETE SET NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  mailgun_message_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'delivered', 'failed', 'complained')),
  opened_at TEXT NULL,
  unsubscribed_at TEXT NULL,
  error TEXT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, email)
);

CREATE INDEX sends_campaign_status ON sends (campaign_id, status);
CREATE INDEX campaigns_status_scheduled ON campaigns (status, scheduled_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE webhook_tokens (
  token TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
