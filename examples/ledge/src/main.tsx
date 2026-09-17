import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';

import { App } from './App';
import './styles/tokens.css';
import './styles/ledge.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
