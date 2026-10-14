import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAccessMiddleware } from '../../src/worker/auth';
import type { AppEnv } from '../../src/worker/env';

const TEAM = 'enhanced.cloudflareaccess.com';
const AUD = 'aud-tag-123';
let privateKey: CryptoKey;
let app: Hono<AppEnv>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  app = new Hono<AppEnv>();
  app.use('/api/*', createAccessMiddleware(() => jwks));
  app.get('/api/me', (c) => c.json({ email: c.get('userEmail') }));
});

const realEnv = () => ({ ...env, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });

async function token(opts: { aud?: string; exp?: string | number } = {}) {
  return new SignJWT({ email: 'dan@enhancedgroup.co.uk' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(privateKey);
}

const call = (headers: Record<string, string>, e = realEnv()) => app.request('https://news.enhancedgroup.co.uk/api/me', { headers }, e);

describe('Cloudflare Access middleware', () => {
  it('accepts a valid token and exposes the email', async () => {
    const res = await call({ 'Cf-Access-Jwt-Assertion': await token() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'dan@enhancedgroup.co.uk' });
  });

  it('rejects a missing header', async () => {
    const res = await call({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Your session expired — reload to sign in' });
  });

  it('rejects the wrong audience', async () => {
    expect((await call({ 'Cf-Access-Jwt-Assertion': await token({ aud: 'other' }) })).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect((await call({ 'Cf-Access-Jwt-Assertion': await token({ exp: past }) })).status).toBe(401);
  });

  it('ignores DEV_AUTH_BYPASS when a real ACCESS_AUD is configured', async () => {
    expect((await call({}, { ...realEnv(), DEV_AUTH_BYPASS: 'true' })).status).toBe(401);
  });

  it('allows DEV_AUTH_BYPASS only with the placeholder AUD', async () => {
    const res = await call({}, { ...env, ACCESS_AUD: 'set-me', DEV_AUTH_BYPASS: 'true' });
    expect(await res.json()).toEqual({ email: 'dev@enhancedgroup.co.uk' });
  });
});
