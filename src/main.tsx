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

const redirectPath = new URLSearchParams(window.location.search).get('redirect');
if (redirectPath) {
  const normalizedPath = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`;
  window.history.replaceState({}, '', normalizedPath);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });

  // When a reminder notification is tapped while the app is already open
  // in a tab, the SW focuses that tab and posts this message so we can
  // jump straight to the relevant agenda instead of just refocusing.
  navigator.serviceWorker.addEventListener('message', (event) => {
    const url = (event.data as { type?: string; url?: string } | undefined)?.url;
    if ((event.data as { type?: string } | undefined)?.type === 'agenda-reminder-click' && url) {
      const hash = url.startsWith('/#') ? url.slice(1) : url;
      window.location.hash = hash;
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
