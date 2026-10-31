import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import "./Feedback.css";
import { FeedbackContext } from "./FeedbackContextValue";

const icons = { success: CheckCircle2, error: AlertCircle, warning: TriangleAlert, info: Info };

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    if (!dialog) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") { dialog.resolve(false); setDialog(null); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialog]);
  const notify = useCallback((message, type = "info") => {
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500);
  }, []);
  const confirm = useCallback((message, { title = "Please confirm", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) => new Promise((resolve) => setDialog({ message, title, confirmLabel, cancelLabel, danger, resolve })), []);
  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);
  return <FeedbackContext.Provider value={value}>{children}
    <div className="feedback-toasts" aria-live="polite" aria-relevant="additions">
      <AnimatePresence>{toasts.map((toast) => { const Icon = icons[toast.type] || Info; return <motion.div key={toast.id} className={`feedback-toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}><Icon size={18} /><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X size={16} /></button></motion.div>; })}</AnimatePresence>
    </div>
    <AnimatePresence>{dialog && <motion.div className="feedback-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { dialog.resolve(false); setDialog(null); } }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="feedback-dialog" role="alertdialog" aria-modal="true" aria-labelledby="feedback-dialog-title" initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }}><h2 id="feedback-dialog-title">{dialog.title}</h2><p>{dialog.message}</p><footer><button onClick={() => { dialog.resolve(false); setDialog(null); }}>{dialog.cancelLabel}</button><button className={dialog.danger ? "danger" : "primary"} onClick={() => { dialog.resolve(true); setDialog(null); }}>{dialog.confirmLabel}</button></footer></motion.section></motion.div>}</AnimatePresence>
  </FeedbackContext.Provider>;
}

