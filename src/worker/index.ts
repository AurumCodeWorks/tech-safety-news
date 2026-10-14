import { Hono } from 'hono';
import type { AppEnv, Env } from './env';

export const app = new Hono<AppEnv>();

app.get('/healthz', (c) => c.json({ ok: true }));

app.get('/admin', (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)));
app.get('/admin/*', (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export async function scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {}

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
