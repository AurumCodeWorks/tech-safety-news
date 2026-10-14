import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations('migrations');

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: migrations,
                MAILGUN_API_KEY: 'test-key',
                MAILGUN_WEBHOOK_SIGNING_KEY: 'test-signing-key',
                UNSUB_SECRET: 'test-unsub-secret',
              },
            },
          }),
        ],
        test: {
          name: 'worker',
          include: ['test/worker/**/*.test.ts', 'test/email/**/*.test.ts', 'test/shared/**/*.test.ts'],
          setupFiles: ['test/worker/setup.ts'],
        },
      },
      {
        test: { name: 'node', environment: 'node', include: ['test/node/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['test/app/**/*.test.tsx'],
          setupFiles: ['test/app/setup.ts'],
        },
      },
    ],
  },
});
