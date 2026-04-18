import { useApp } from '../context/AppContext';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, XCircle } from 'lucide-react';

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertCircle,
};

const bgColors = {
  success: 'var(--success)',
  error: 'var(--danger)',
  info: 'var(--accent)',
  warning: 'var(--warning)',
};

export default function ToastContainer() {
  const { toasts } = useApp();

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <AnimatePresence>
        {toasts.map(t => {
          const Icon = icons[t.type] || Info;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              style={{
                padding: '12px 20px', borderRadius: 'var(--radius-sm)',
                fontSize: 13, fontWeight: 500, color: 'white',
                background: bgColors[t.type] || bgColors.info,
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }}
            >
              <Icon size={16} />
              {t.msg}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
