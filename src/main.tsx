import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { installStaleBuildReload } from './lib/staleBuildReload';

// A tab left open across a deploy loads the new build instead of failing on a page file that no longer exists.
installStaleBuildReload();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
