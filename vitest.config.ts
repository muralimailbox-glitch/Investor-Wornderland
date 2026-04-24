import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/_setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/ai/cost.ts',
        'src/lib/ai/injection.ts',
        'src/lib/auth/password.ts',
        'src/lib/auth/totp.ts',
        'src/lib/auth/nda-session.ts',
        'src/lib/api/handle.ts',
        'src/lib/api/ask.ts',
        'src/lib/api/nda.ts',
        'src/lib/api/lounge.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 70,
      },
    },
  },
});
