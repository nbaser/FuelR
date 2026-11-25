import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { autoBackupOnUpdate } from './lib/storage';
import './styles.css';

// Vor allem anderen: Datenstand der vorherigen Version sichern
autoBackupOnUpdate(__APP_BUILD__);

// PWA-Installationen (z. B. über "Chrome installieren") merken sonst neue Versionen erst
// nach Tagen, weil der Service Worker nur selten von selbst nach Updates sucht.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update();
    });
  },
});

// Browser bitten, die lokalen Daten nicht automatisch zu löschen
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
