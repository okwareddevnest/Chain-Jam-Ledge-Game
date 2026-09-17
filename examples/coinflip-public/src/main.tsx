import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/poppins/500.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/700-italic.css';
import '@fontsource/poppins/800.css';
import '@fontsource/poppins/800-italic.css';
import '@fontsource/poppins/900.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';

import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
