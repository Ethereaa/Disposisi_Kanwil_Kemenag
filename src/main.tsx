import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    deferredInstallPrompt?: Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.deferredInstallPrompt = event as Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
