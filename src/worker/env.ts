export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_BASE_URL: string;
  MAILGUN_DOMAIN: string;
  MAILGUN_BASE_URL: string;
  MAILGUN_BATCH_SIZE: string;
  SENDER_ADDRESS: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  MAILGUN_API_KEY: string;
  MAILGUN_WEBHOOK_SIGNING_KEY: string;
  UNSUB_SECRET: string;
  DEV_AUTH_BYPASS?: string;
  TEST_NOW?: string;
}

export type AppEnv = { Bindings: Env; Variables: { userEmail: string } };
