import { motion } from 'framer-motion';

const SIZE = 120, STROKE = 8;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function HealthRing({ value = 0, label = 'Score', color = '#3b82f6', icon: Icon }) {
  const offset = C - (value / 100) * C;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <filter id={`glow-${label.replace(/\s/g, '')}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} opacity={0.3} />
          <motion.circle
            cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke={color} strokeWidth={STROKE}
            strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            filter={`url(#glow-${label.replace(/\s/g, '')})`}
          />
        </svg>
        <div style={{ 
          position: 'absolute', inset: 0, 
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' 
        }}>
          {Icon && <Icon size={16} color={color} style={{ opacity: 0.8, marginBottom: 2 }} />}
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {value}<span style={{ fontSize: 14, opacity: 0.6, fontWeight: 600 }}>%</span>
          </div>
        </div>
      </div>
      <span style={{ 
        fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', 
        textTransform: 'uppercase', letterSpacing: 1.5,
        background: 'var(--bg-surface)', padding: '2px 10px', borderRadius: 10, border: '1px solid var(--border)'
      }}>
        {label}
      </span>
    </div>
  );
}
