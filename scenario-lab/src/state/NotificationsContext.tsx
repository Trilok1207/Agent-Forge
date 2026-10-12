import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'info' | 'success' | 'error';
interface Note {
  id: number;
  tone: Tone;
  text: string;
}

const NotifyContext = createContext<((text: string, tone?: Tone) => void) | null>(null);

let counter = 0;

/** Short-lived status messages, announced to screen readers via a live region. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const dismiss = useCallback((id: number) => setNotes((n) => n.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (text: string, tone: Tone = 'info') => {
      const id = ++counter;
      setNotes((n) => [...n.slice(-3), { id, tone, text }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {notes.map((n) => (
          <div key={n.id} className={`toast toast--${n.tone}`}>
            <span>{n.text}</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => dismiss(n.id)} aria-label="Dismiss message">
              ×
            </button>
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used inside NotificationsProvider');
  return ctx;
}
