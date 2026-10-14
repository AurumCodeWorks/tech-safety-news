import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createMailgun, MailgunError } from '../../src/worker/mailgun';
import { signUnsubToken, verifyUnsubToken } from '../../src/worker/tokens';
import { mockFetch } from './helpers';

describe('Mailgun client', () => {
  it('posts a message to the EU API with our sender and no click tracking', async () => {
    const m = mockFetch(() => Response.json({ id: '<abc@news.enhancedgroup.co.uk>', message: 'Queued' }));
    const mg = createMailgun(env, 'Enhanced Group Tech Safety', m.fn);
    const res = await mg.sendBatch({
      to: ['a@x.com', 'b@x.com'],
      subject: 'Hi',
      html: '<p>x</p>',
      text: 'x',
      recipientVariables: { 'a@x.com': { name: 'A' }, 'b@x.com': { name: 'B' } },
      headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      variables: { send_id: '%recipient.send_id%' },
    });
    expect(res.id).toBe('<abc@news.enhancedgroup.co.uk>');
    const call = m.calls[0];
    expect(call.url).toBe('https://api.eu.mailgun.net/v3/news.enhancedgroup.co.uk/messages');
    expect(call.auth).toBe(`Basic ${btoa('api:test-key')}`);
    const f = call.form!;
    expect(f.get('from')).toBe('"Enhanced Group Tech Safety" <noreply@news.enhancedgroup.co.uk>');
    expect(f.getAll('to')).toEqual(['a@x.com', 'b@x.com']);
    expect(f.get('o:tracking-clicks')).toBe('no');
    expect(f.get('o:tracking-opens')).toBe('yes');
    expect(f.get('h:List-Unsubscribe-Post')).toBe('List-Unsubscribe=One-Click');
    expect(f.get('v:send_id')).toBe('%recipient.send_id%');
    expect(f.has('h:Reply-To')).toBe(false);
    expect(JSON.parse(f.get('recipient-variables') as string)).toEqual({ 'a@x.com': { name: 'A' }, 'b@x.com': { name: 'B' } });
  });

  it('throws MailgunError on a failed response', async () => {
    const m = mockFetch(() => new Response('Forbidden', { status: 401 }));
    const mg = createMailgun(env, 'X', m.fn);
    await expect(mg.sendBatch({ to: ['a@x.com'], subject: 's', html: 'h', text: 't' })).rejects.toBeInstanceOf(MailgunError);
  });

  it('reports the domain as verified only when active with valid sending records', async () => {
    const ok = mockFetch(() => Response.json({ domain: { state: 'active' }, sending_dns_records: [{ valid: 'valid' }, { valid: 'valid' }] }));
    expect(await createMailgun(env, 'X', ok.fn).domainStatus()).toBe('verified');
    expect(ok.calls[0].url).toBe('https://api.eu.mailgun.net/v4/domains/news.enhancedgroup.co.uk');
    const bad = mockFetch(() => Response.json({ domain: { state: 'active' }, sending_dns_records: [{ valid: 'valid' }, { valid: 'invalid' }] }));
    expect(await createMailgun(env, 'X', bad.fn).domainStatus()).toBe('unverified');
    const down = mockFetch(() => new Response('oops', { status: 500 }));
    expect(await createMailgun(env, 'X', down.fn).domainStatus()).toBe('unverified');
    // Domain sending keys can only send, so Mailgun refuses the status lookup: that's 'unknown', not a failure.
    const sendingKey = mockFetch(() => new Response('Forbidden', { status: 401 }));
    expect(await createMailgun(env, 'X', sendingKey.fn).domainStatus()).toBe('unknown');
    const forbidden = mockFetch(() => new Response('Forbidden', { status: 403 }));
    expect(await createMailgun(env, 'X', forbidden.fn).domainStatus()).toBe('unknown');
  });
});

describe('unsubscribe tokens', () => {
  it('round-trips send ids and test markers', async () => {
    const t = await signUnsubToken('secret', { sendId: 42 });
    expect(await verifyUnsubToken('secret', t)).toEqual({ sendId: 42 });
    const test = await signUnsubToken('secret', { test: 7 });
    expect(await verifyUnsubToken('secret', test)).toEqual({ test: 7 });
  });

  it('rejects tampered tokens, other secrets and garbage', async () => {
    const t = await signUnsubToken('secret', { sendId: 42 });
    const [payload, sig] = t.split('.');
    const forged = `${btoa(JSON.stringify({ sendId: 43 })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.${sig}`;
    expect(await verifyUnsubToken('secret', forged)).toBeNull();
    expect(await verifyUnsubToken('other', t)).toBeNull();
    expect(await verifyUnsubToken('secret', 'garbage')).toBeNull();
    expect(await verifyUnsubToken('secret', `${payload}.`)).toBeNull();
  });
});
