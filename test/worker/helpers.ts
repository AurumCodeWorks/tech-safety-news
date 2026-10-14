import { env } from 'cloudflare:workers';
import { app } from '../../src/worker/index';

export const BASE = 'https://news.enhancedgroup.co.uk';

/** Signed-in admin request (dev bypass is allowed because tests use the placeholder ACCESS_AUD). */
export function api(path: string, init: RequestInit & { json?: unknown } = {}, extraEnv: Record<string, unknown> = {}) {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  return app.request(`${BASE}${path}`, { ...init, headers, body }, { ...env, DEV_AUTH_BYPASS: 'true', ...extraEnv });
}

/** Public (no auth) request. */
export function pub(path: string, init: RequestInit = {}, extraEnv: Record<string, unknown> = {}) {
  return app.request(`${BASE}${path}`, init, { ...env, ...extraEnv });
}

export const uid = () => Math.random().toString(36).slice(2, 8);
