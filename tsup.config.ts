import { defineConfig } from 'tsup'

// ESM output: chalk 5, ora 8 and open 10 are ESM-only. A CJS bundle with those deps
// external crashes with ERR_REQUIRE_ESM on any Node without require(esm)
// (Node 18, Node 20 < 20.19, Node 22 < 22.12).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
