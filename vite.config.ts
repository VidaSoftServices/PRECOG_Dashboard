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
        manualChunks: {
          vendor_react: ['react', 'react-dom', 'react-router-dom'],
          vendor_fluent: ['@fluentui/react-components', '@fluentui/react-icons'],
          vendor_charts: ['chart.js', 'react-chartjs-2'],
          vendor_query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
