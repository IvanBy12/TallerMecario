import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { parsePublicEnv } from '@/shared/config/public-env';

import '@/app/app.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App envResult={parsePublicEnv(import.meta.env)} />
  </StrictMode>,
);
