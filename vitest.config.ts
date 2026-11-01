import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// E2: vitest runs the store/service scripts (tests/*.mts, node env) and the
// component tests (tests/components/*.test.tsx, jsdom via file pragma).
// The word-list validator runs separately first (npm test).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    include: ['tests/*.mts', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15000,
  },
})
