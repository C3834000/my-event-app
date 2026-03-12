import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { migrateFromLocalStorage } from './services/supabase';
import { startAutoBackup, createAutoBackup, restoreFromAutoBackup, exportToFile, getBackupInfo, validateData } from './services/autoBackup';

// הוסף את פונקציית המיגרציה ל-window כדי שניתן יהיה להפעיל אותה מהקונסול
(window as any).migrateFromLocalStorage = migrateFromLocalStorage;

// הוסף פונקציות גיבוי ל-window
(window as any).backup = {
  create: createAutoBackup,
  restore: restoreFromAutoBackup,
  export: exportToFile,
  info: getBackupInfo,
  validate: validateData
};

// הפעל גיבוי אוטומטי
startAutoBackup();
console.log('🛡️ מערכת גיבוי אוטומטי הופעלה');
console.log('💡 טיפ: הקלד window.backup.export() כדי להוריד גיבוי ידני');

// ביטול Service Workers ישנים
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      registration.unregister();
      console.log('🧹 Service Worker בוטל:', registration.scope);
    });
  });
  
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        caches.delete(cacheName);
        console.log('🧹 Cache נמחק:', cacheName);
      });
    });
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);