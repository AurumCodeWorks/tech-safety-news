import type { Env } from './env';

export type MailgunMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  recipientVariables?: Record<string, Record<string, string>>;
  headers?: Record<string, string>;
  variables?: Record<string, string>;
  testMode?: boolean;
};

export class MailgunError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Mailgun error ${status}: ${body.slice(0, 200)}`);
  }
}

export type Mailgun = ReturnType<typeof createMailgun>;
export type DomainStatus = 'verified' | 'unverified' | 'unknown';

export function createMailgun(env: Env, senderName: string, fetchImpl: typeof fetch = fetch) {
  const auth = `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`;
  const base = env.MAILGUN_BASE_URL.replace(/\/$/, '');

  return {
    async sendBatch(msg: MailgunMessage): Promise<{ id: string }> {
      const form = new FormData();
      form.append('from', `"${senderName.replace(/"/g, '')}" <${env.SENDER_ADDRESS}>`);
      for (const to of msg.to) form.append('to', to);
      form.append('subject', msg.subject);
      form.append('html', msg.html);
      form.append('text', msg.text);
      // Click tracking rewrites every link into a tracking URL, which looks exactly like phishing.
      form.append('o:tracking-clicks', 'no');
      form.append('o:tracking-opens', 'yes');
      if (msg.testMode) form.append('o:testmode', 'yes');
      if (msg.recipientVariables) form.append('recipient-variables', JSON.stringify(msg.recipientVariables));
      for (const [k, v] of Object.entries(msg.headers ?? {})) form.append(`h:${k}`, v);
      for (const [k, v] of Object.entries(msg.variables ?? {})) form.append(`v:${k}`, v);

      const res = await fetchImpl(`${base}/v3/${env.MAILGUN_DOMAIN}/messages`, { method: 'POST', headers: { Authorization: auth }, body: form });
      if (!res.ok) throw new MailgunError(res.status, await res.text());
      const data = (await res.json()) as { id: string };
      return { id: data.id };
    },

    /**
     * 'unknown' means the key isn't allowed to read domain settings (Mailgun domain sending keys
     * can only send). Sending isn't blocked then: the required test send is the safety net.
     */
    async domainStatus(): Promise<DomainStatus> {
      try {
        const res = await fetchImpl(`${base}/v4/domains/${env.MAILGUN_DOMAIN}`, { headers: { Authorization: auth } });
        if (res.status === 401 || res.status === 403) return 'unknown';
        if (!res.ok) return 'unverified';
        const data = (await res.json()) as { domain?: { state?: string }; sending_dns_records?: { valid?: string }[] };
        const records = data.sending_dns_records ?? [];
        return data.domain?.state === 'active' && records.length > 0 && records.every((r) => r.valid === 'valid') ? 'verified' : 'unverified';
      } catch {
        return 'unverified';
      }
    },
  };
}
