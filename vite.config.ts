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

export default defineConfig({
  plugins: [react(), forbidSolutionsInBundle()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.id && SOLUTION_PATTERN.test(warning.id)) {
          throw new Error(`Reference solution referenced during build: ${warning.id}`);
        }
        defaultHandler(warning);
      },
    },
  },
});
