import type { Env } from './env';

/** Current time in ms. Tests pass TEST_NOW in the env to pin the clock; production never sets it. */
export function nowMs(env: Pick<Env, 'TEST_NOW'>): number {
  return env.TEST_NOW ? Date.parse(env.TEST_NOW) : Date.now();
}

export function nowIso(env: Pick<Env, 'TEST_NOW'>): string {
  return new Date(nowMs(env)).toISOString();
}
