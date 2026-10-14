import { Hono } from 'hono';
import { createAccessMiddleware } from './auth';
import type { AppEnv, Env } from './env';
import { listsRoutes } from './routes/api-lists';

export const app = new Hono<AppEnv>();

app.get('/healthz', (c) => c.json({ ok: true }));

app.use('/api/*', createAccessMiddleware());
app.route('/api/lists', listsRoutes);

app.get('/admin', (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)));
app.get('/admin/*', (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)));

app.notFound((c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json({ error: 'Not found' }, 404)));

export async function scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {}

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
