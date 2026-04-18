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
      className="card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span className="card-icon">{icon}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums', color: colorMap[color] || colorMap.blue }}>
        {value == null || value === '—' ? '—' : <AnimatedNumber value={isNaN(numValue) ? 0 : numValue} />}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {label}
        {sublabel && <span> · {sublabel}</span>}
      </div>
    </motion.div>
  );
}
