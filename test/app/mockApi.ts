import { vi } from 'vitest';

type Handler = unknown | ((body: unknown) => unknown);

/** Stubs fetch with routes keyed "METHOD /path"; records calls. Unknown routes return 404. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      calls.push({ method, path: url.pathname, body });
      const handler = routes[`${method} ${url.pathname}`];
      if (handler === undefined) return Response.json({ error: 'Not found' }, { status: 404 });
      const result = typeof handler === 'function' ? (handler as (b: unknown) => unknown)(body) : handler;
      if (result instanceof Response) return result;
      return result === null ? new Response(null, { status: 204 }) : Response.json(result);
    }),
  );
  return calls;
}
