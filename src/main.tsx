import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useGame } from './game/store.ts';
import { App } from './ui/App.tsx';
import { CanvasRenderer } from './ui/adapters.ts';
import './ui/styles/tokens.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

// On an /order/ URL the router opens the level at import time, so FeedCanvas mounts on the
// first render and hands the canvas to whatever renderer the store holds then. Attaching from
// an effect in App would be too late: child effects run first, and the swap orphans the canvas.
useGame.getState().attachRenderer(new CanvasRenderer());

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
