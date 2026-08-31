/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8432, // change this to your desired port
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: false,
    // Fluent UI pulls in `tabster`, a CJS package whose named exports
    // Node's ESM loader can't statically detect - without this, any test
    // that renders a real Fluent component (Dialog, DataGrid, etc., not
    // just a bare <div>) fails at import time with "Named export
    // 'createTabster' not found". Pre-bundling it through Vite's dependency
    // optimizer (the "client" environment, matching jsdom) converts it to
    // clean ESM first, same as `vite dev` already does for the real browser
    // build; server.deps.inline is kept too as a second attempt at forcing
    // a transform rather than a passthrough to Node's native loader.
    deps: {
      optimizer: {
        client: {
          enabled: true,
          include: ['tabster', 'keyborg'],
        },
      },
    },
    server: {
      deps: {
        inline: ['tabster', 'keyborg'],
      },
    },
    // 'forks' (the default) spawns real child processes whose CJS module
    // loader chokes on a couple of jsdom's transitive deps that ship
    // ESM-only files (a current jsdom dependency-chain issue, unrelated to
    // this project's own code). Plain 'threads' avoids that, but the
    // `deps.optimizer`/`server.deps` options above - needed so Fluent UI's
    // CJS `tabster` dependency resolves at all when a test renders a real
    // Fluent component (Dialog, DataGrid, etc.) - only take effect under
    // 'vmThreads'; confirmed the whole suite still passes under it, so it
    // does not reintroduce the 'forks' problem above.
    pool: 'vmThreads',
  },
  build: {
    rollupOptions: {
      output: {
        // Function form, not the plain per-package object form: the object
        // form matches by exact package name, which groups the
        // `react-datepicker` *JS* correctly but leaves
        // `react-datepicker/dist/react-datepicker.css` (imported once, from
        // DateTimeField.tsx) as a separate Rollup module ID that the object
        // form never matches. That CSS still fell back to Rollup's default
        // shared-chunk naming - observed as a misleadingly large
        // "aggregationPolicies-*.css" (21.8 kB) sitting next to the
        // correctly-named, unrelated ~2.4 kB "aggregationPolicies-*.js"
        // hooks chunk. Same defect class the object-form fix below already
        // believed it had fully closed for the JS side; matching by
        // substring against the module ID catches both the JS and its CSS
        // import under one explicitly-named chunk.
        manualChunks(id) {
          if (id.includes('node_modules/react-datepicker')) return 'vendor_datepicker';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom') ||
              /node_modules[\\/]react[\\/]/.test(id)) return 'vendor_react';
          if (id.includes('node_modules/@fluentui')) return 'vendor_fluent';
          if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) return 'vendor_charts';
          if (id.includes('node_modules/@tanstack/react-query')) return 'vendor_query';
          return undefined;
        },
      },
    },
  },
});
