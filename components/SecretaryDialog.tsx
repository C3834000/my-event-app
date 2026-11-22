import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/** חלון נגיש עם סגירה במקש Escape והחזרת הפוקוס לכפתור שפתח אותו. */
const SecretaryDialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  return <dialog
    ref={dialogRef}
    aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="fixed m-auto w-[calc(100%-1.5rem)] max-w-xl max-h-[90dvh] overflow-hidden rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60"
  >
    <div className="flex max-h-[90dvh] flex-col" dir="rtl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h3 id={titleId} className="text-lg font-black">{title}</h3>
        <button type="button" autoFocus onClick={onClose} aria-label="סגירה" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600"><X size={20} /></button>
      </div>
      <div className="min-h-0 overflow-y-auto p-5">{children}</div>
    </div>
  </dialog>;
};

export default SecretaryDialog;
