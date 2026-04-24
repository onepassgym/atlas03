import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (typeof value !== 'number' || isNaN(value)) { setDisplay(value); return; }
    const start = display || 0;
    const diff = value - start;
    if (diff === 0) return;
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);

  return typeof display === 'number' ? display.toLocaleString() : (display ?? '—');
}

const colorMap = {
  blue: 'var(--accent)', green: 'var(--success)', yellow: 'var(--warning)',
  red: 'var(--danger)', purple: 'var(--purple)', cyan: 'var(--cyan)', orange: 'var(--orange)',
};

export default function StatCard({ title, value, label, icon, color = 'blue', sublabel }) {
  const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;

  return (
    <motion.div
      className="card stat-card-hud"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px rgba(0,0,0,0.2)`
      }}
    >
      <div className="card-header" style={{ marginBottom: 12 }}>
        <span className="card-title" style={{ fontSize: 13, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{title}</span>
        <span className="card-icon" style={{ color: colorMap[color], filter: `drop-shadow(0 0 8px ${colorMap[color]}44)` }}>{icon}</span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums', color: '#fff', textShadow: `0 0 20px ${colorMap[color]}55` }}>
        {value == null || value === '—' ? '—' : <AnimatedNumber value={isNaN(numValue) ? 0 : numValue} />}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color: colorMap[color] || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
        {sublabel && <span> · {sublabel}</span>}
      </div>
    </motion.div>
  );
}
