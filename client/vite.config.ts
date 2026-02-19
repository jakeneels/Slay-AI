import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [],
  server: {
    open: '/game.html',
    hmr: {
      overlay: true
    },
    watch: {
      // Ensure all source files are watched
      usePolling: false
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**'
      ],
      thresholds: {
        statements: 20,
        lines: 20,
        functions: 40,
        branches: 40,
      },
    }
  }
})
