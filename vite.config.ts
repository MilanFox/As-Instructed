import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const SOLUTION_PATTERN = /__solutions__/;

/**
 * Reference solutions are test fixtures. DESIGN.md §10.4: they must never reach the client
 * bundle. Vitest imports them directly, so we cannot simply delete them from the tree — instead
 * we hard-fail the production build the moment one becomes reachable from src/main.tsx.
 */
function forbidSolutionsInBundle(): Plugin {
  return {
    name: 'bootstrap:forbid-solutions',
    apply: 'build',
    resolveId(source, importer) {
      if (!importer) return null;
      if (SOLUTION_PATTERN.test(source) || SOLUTION_PATTERN.test(importer)) {
        this.error(
          `Reference solution reachable from the production bundle: "${source}" imported by "${importer}". ` +
            'Solutions are test fixtures only (DESIGN.md §5, §10.4).',
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

/**
 * Monaco is roughly nine tenths of the build. `src/ui/adapters.ts` reaches it through a dynamic
 * `import()` and the workspace is lazy, so it already lands in its own chunk — naming it here
 * keeps it out of anything else's, and gives it a cache lifetime of its own: the editor does not
 * change when a level does.
 *
 * `worker: { format: 'es' }` (DESIGN.md §3) is deliberately untouched. The sim worker and Monaco's
 * own workers are separate builds and manual chunking does not apply to them.
 */
function manualChunks(id: string): string | undefined {
  // Vite's dynamic-import preload helper is shared by every chunk. Left unplaced it lands in
  // whichever chunk Rollup picks first — which was Monaco, giving the entry a static import of it.
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
