import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/worker/index';

describe('health', () => {
  it('GET /healthz returns ok', async () => {
    const res = await app.request('https://news.enhancedgroup.co.uk/healthz', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
