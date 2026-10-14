export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reasons: string[] = [],
  ) {
    super(message);
  }
}

export const SESSION_EXPIRED_EVENT = 'tsn:session-expired';

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body, credentials: 'same-origin' });
  if (res.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; reasons?: string[] };
    throw new ApiError(res.status, data.error ?? 'Something went wrong. Try again.', data.reasons ?? []);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('Content-Type') ?? '';
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
}
