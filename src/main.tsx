import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { autoBackupOnUpdate } from './lib/storage';
import './styles.css';

// Vor allem anderen: Datenstand der vorherigen Version sichern
autoBackupOnUpdate(__APP_BUILD__);

registerSW({ immediate: true });

// Browser bitten, die lokalen Daten nicht automatisch zu löschen
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
