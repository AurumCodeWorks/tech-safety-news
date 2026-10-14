import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AppEnv, Env } from './env';

export const SESSION_EXPIRED = 'Your session expired — reload to sign in';
const DEV_USER = 'dev@enhancedgroup.co.uk';

const remoteSets = new Map<string, JWTVerifyGetKey>();

function defaultKeys(env: Env): JWTVerifyGetKey {
  let set = remoteSets.get(env.ACCESS_TEAM_DOMAIN);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    remoteSets.set(env.ACCESS_TEAM_DOMAIN, set);
  }
  return set;
}

export function createAccessMiddleware(getKeys: (env: Env) => JWTVerifyGetKey = defaultKeys): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Double guard: the bypass only works with the placeholder AUD, which a deployed config never has.
    if (c.env.DEV_AUTH_BYPASS === 'true' && c.env.ACCESS_AUD === 'set-me') {
      c.set('userEmail', DEV_USER);
      return next();
    }
    const jwt = c.req.header('Cf-Access-Jwt-Assertion');
    if (!jwt) return c.json({ error: SESSION_EXPIRED }, 401);
    try {
      const { payload } = await jwtVerify(jwt, getKeys(c.env), {
        issuer: `https://${c.env.ACCESS_TEAM_DOMAIN}`,
        audience: c.env.ACCESS_AUD,
      });
      if (typeof payload.email !== 'string') return c.json({ error: SESSION_EXPIRED }, 401);
      c.set('userEmail', payload.email);
    } catch {
      return c.json({ error: SESSION_EXPIRED }, 401);
    }
    return next();
  };
}
