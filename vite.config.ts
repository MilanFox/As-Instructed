import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const SOLUTION_PATTERN = /__solutions__/;

function forbidSolutionsInBundle(): Plugin {
  return {
    name: 'bootstrap:forbid-solutions',
    apply: 'build',
    resolveId(source, importer) {
      if (!importer) return null;
      if (SOLUTION_PATTERN.test(source) || SOLUTION_PATTERN.test(importer)) {
        this.error(
          `Reference solution reachable from the production bundle: "${source}" imported by "${importer}". ` +
            'Solutions are test fixtures only.',
        );
      }
      return null;
    },
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const leaked = Object.keys(chunk.modules).find((id) => SOLUTION_PATTERN.test(id));
        if (leaked)
          this.error(`Reference solution leaked into chunk "${chunk.fileName}": ${leaked}`);
      }
    },
  };
}

function manualChunks(id: string): string | undefined {
  if (id.includes('vite/preload-helper')) return 'vendor';
  if (id.includes('/node_modules/monaco-editor/') || id.includes('/node_modules/@monaco-editor/')) {
    return 'monaco';
  }
  if (/\/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store)\//.test(id)) {
    return 'vendor';
  }
  if (id.includes('/src/levels/')) return 'levels';
  if (id.includes('/src/engine/')) return 'engine';
  return undefined;
}

export default defineConfig({
  plugins: [react(), forbidSolutionsInBundle()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks },
      onwarn(warning, defaultHandler) {
        if (warning.id && SOLUTION_PATTERN.test(warning.id)) {
          throw new Error(`Reference solution referenced during build: ${warning.id}`);
        }
        defaultHandler(warning);
      },
    },
  },
});
