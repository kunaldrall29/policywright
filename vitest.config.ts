import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'text-summary'],
      // The synthesizer and simulator are the core logic; hold their coverage
      // high. The CLI/demo/live-RPC glue is exercised via the demo and manual
      // recording rather than unit tests, so it is not held to the same bar.
      thresholds: {
        'src/synthesizer.ts': { lines: 90, functions: 90, branches: 85, statements: 90 },
        'src/simulate.ts': { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
