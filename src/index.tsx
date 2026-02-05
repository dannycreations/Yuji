import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { YujiApp } from './app/Yuji';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <YujiApp />
  </StrictMode>,
);
