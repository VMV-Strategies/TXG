import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { init } from './state/store';
import { registerServiceWorker } from './app/pwa';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
void init();
registerServiceWorker();
