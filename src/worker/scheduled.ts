import { nowIso, nowMs } from './clock';
import type { Env } from './env';
import { runCampaignSend } from './send';

/** Cron (every 5 minutes): send campaigns that are due, and clear old webhook replay tokens. */
export async function handleScheduled(env: Env): Promise<void> {
  const now = nowIso(env);
  const { results } = await env.DB.prepare("SELECT id FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at")
    .bind(now)
    .all<{ id: number }>();
  for (const { id } of results) {
    try {
      await runCampaignSend(env, id, 'scheduler');
    } catch (e) {
      console.error(JSON.stringify({ event: 'scheduled_send_error', campaignId: id, error: String(e) }));
    }
  }
  const cutoff = new Date(nowMs(env) - 60 * 60_000).toISOString();
  await env.DB.prepare('DELETE FROM webhook_tokens WHERE received_at < ?').bind(cutoff).run();
}
