import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmWord: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmWord,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel
}) => {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setTyped('');
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const matched = typed === confirmWord;
  const confirmBtnClass = destructive
    ? matched && !busy
      ? 'bg-rose-600 hover:bg-rose-700'
      : 'bg-rose-300 cursor-not-allowed'
    : matched && !busy
      ? 'bg-zinc-900 hover:bg-zinc-800'
      : 'bg-zinc-400 cursor-not-allowed';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md border border-zinc-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-zinc-200 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {destructive && (
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            <h3 id="confirm-title" className="text-lg font-display font-semibold text-zinc-900">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-700 p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-zinc-600 leading-relaxed">{description}</div>

          <div>
            <label className="block text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
              Type <span className="text-zinc-900 font-mono">"{confirmWord}"</span> to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              autoComplete="off"
              spellCheck={false}
              className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono bg-white outline-none focus:ring-1 ${
                matched
                  ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500'
                  : 'border-slate-200 focus:border-indigo-650 focus:ring-indigo-600'
              }`}
              aria-invalid={typed.length > 0 && !matched}
            />
            {typed.length > 0 && !matched && (
              <p className="text-[10px] font-mono text-rose-600 mt-1">
                Does not match expected text.
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-200 flex justify-end gap-2 bg-zinc-50/50 rounded-b-2xl">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 text-xs font-mono font-semibold hover:bg-zinc-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matched || busy}
            className={`px-4 py-2 rounded-lg text-white text-xs font-mono font-semibold transition ${confirmBtnClass}`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
