import { Hono } from 'hono';
import { createAccessMiddleware } from './auth';
import type { AppEnv, Env } from './env';
import { handleScheduled } from './scheduled';
import { listsRoutes } from './routes/api-lists';
import { recipientsRoutes, suppressionsRoutes } from './routes/api-suppressions';
import { campaignsRoutes, previewRoutes } from './routes/api-campaigns';
import { cardsRoutes, mediaPublicRoutes, mediaUploadRoutes, settingsRoutes } from './routes/api-misc';

export const app = new Hono<AppEnv>();

app.get('/healthz', (c) => c.json({ ok: true }));

app.use('/api/*', createAccessMiddleware());
app.route('/api/lists', listsRoutes);
app.route('/api/suppressions', suppressionsRoutes);
app.route('/api/recipients', recipientsRoutes);
app.route('/api/campaigns', campaignsRoutes);
app.route('/api/preview', previewRoutes);
app.route('/api/cards', cardsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/media', mediaUploadRoutes);
app.route('/media', mediaPublicRoutes);

app.get('/admin', (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)));
app.get('/admin/*', (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)));

app.notFound((c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json({ error: 'Not found' }, 404)));

export async function scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(handleScheduled(env));
}

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
