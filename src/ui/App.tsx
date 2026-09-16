import { useEffect } from 'react';
import { useGame } from '../game/store.ts';
import { RuntimeRunner } from './adapters.ts';
import { PublishDialog } from '../meta/ui/PublishDialog.tsx';
import { useLibrary } from '../meta/store.ts';
import { audio, mountAudio } from './audio.ts';
import { mountCues } from './cues.ts';
import { mountLibrary } from './library.ts';
import { ModalBoundary } from './components/ModalBoundary.tsx';
import { usePaperwork } from './paper/usePaperwork.ts';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { Settings } from './screens/Settings.tsx';
import { LevelSelect } from './screens/LevelSelect.tsx';
import { Workspace } from './workspace/Workspace.tsx';
import { useRunReport } from './report.ts';
import './art.ts';
import './router.ts';
import './styles/fonts.css';
import './styles/app.css';
import './styles/settings.css';
import './styles/art/signal.css';
import './styles/art/deepsite.css';

export function App(): React.JSX.Element {
  useKeyboard();
  usePaperwork();
  useRunReport();
  const screen = useGame((state) => state.screen);

  useEffect(() => {
    const state = useGame.getState();
    const runner = new RuntimeRunner();
    state.attachRunner(runner);
    const detachAudio = mountAudio();
    const detachCues = mountCues({
      achievement: (index, after) => {
        audio.achievement(index, after);
      },
      pulse: () => {
        useGame.getState().renderer().pulse('achievement');
      },
    });
    const detachLibrary = mountLibrary(runner);
    const level = state.currentLevelId;
    if (level) runner.prepare(level);
    return () => {
      detachLibrary();
      detachCues();
      detachAudio();
    };
  }, []);

  return (
    <div className="app">
      {screen === 'workspace' ? <Workspace /> : null}
      {screen === 'levels' ? <LevelSelect /> : null}
      <Settings />
      <div className="modal-layer">
        <ModalBoundary
          label="The publish offer"
          onDismiss={() => useLibrary.getState().skipPublish(false)}
        >
          <PublishDialog />
        </ModalBoundary>
      </div>
    </div>
  );
}
