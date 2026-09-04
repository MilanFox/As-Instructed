/*
 * PLACEHOLDER — the UI agent replaces this file wholesale.
 *
 * It exists so `npm run dev` boots and so the token palette is wired up. Do not build on it,
 * do not extend it, do not import it from anywhere but src/main.tsx.
 */
import { LEVELS, WORLDS } from '../levels/index.ts';

export function App() {
  return (
    <main
      style={{
        display: 'grid',
        placeContent: 'center',
        gap: 'var(--space-3)',
        height: '100%',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 48,
          letterSpacing: '0.18em',
          color: 'var(--accent)',
        }}
      >
        BOOTSTRAP
      </h1>
      <p style={{ margin: 0, color: 'var(--ink-dim)' }}>
        or: How I Learned to Stop Worrying and Automate the Regolith.
      </p>
      <p className="numeric" style={{ margin: 0, color: 'var(--ok)' }}>
        systems nominal — {WORLDS.length} worlds, {LEVELS.length} level
        {LEVELS.length === 1 ? '' : 's'} online
      </p>
    </main>
  );
}
