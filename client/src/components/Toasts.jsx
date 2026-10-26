import { createContext, useCallback, useContext, useState } from 'react';
import { CircleCheck, CircleAlert, X } from 'lucide-react';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback((message, tone = 'success') => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.tone === 'error' ? <CircleAlert size={15} /> : <CircleCheck size={15} />}
            <span>{t.message}</span>
            <button className="icon-btn icon-btn-sm" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={13} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
