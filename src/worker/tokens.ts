// Stateless, signed unsubscribe tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
export type UnsubPayload = { sendId: number } | { test: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function key(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signUnsubToken(secret: string, payload: UnsubPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret, 'sign'), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyUnsubToken(secret: string, token: string): Promise<UnsubPayload | null> {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret, 'verify'), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Record<string, unknown>;
    if (Number.isInteger(payload.sendId)) return { sendId: payload.sendId as number };
    if (Number.isInteger(payload.test)) return { test: payload.test as number };
    return null;
  } catch {
    return null;
  }
}
