import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_CONFIG = {
  idle:      { label: 'Idle',       color: 'var(--text-muted)',  icon: '💤', pulse: false },
  searching: { label: 'Searching',  color: 'var(--cyan)',        icon: '🔍', pulse: true },
  scraping:  { label: 'Scraping',   color: 'var(--success)',     icon: '⚡', pulse: true },
  paused:    { label: 'Paused',     color: 'var(--warning)',     icon: '☕', pulse: false },
  blocked:   { label: 'Blocked',    color: 'var(--danger)',      icon: '🛑', pulse: true },
};

function ThrottleGauge({ multiplier }) {
  const pct = Math.min(100, (multiplier / 4) * 100);
  const color = multiplier <= 1.0 ? 'var(--success)' : multiplier <= 2.0 ? 'var(--warning)' : 'var(--danger)';
  const label = multiplier <= 0.85 ? 'Cruising' : multiplier <= 1.1 ? 'Normal' : multiplier <= 2.0 ? 'Caution' : 'Emergency';

  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Throttle</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color, fontWeight: 700 }}>{multiplier.toFixed(2)}× · {label}</span>
      </div>
      <div className="progress-bar" style={{ height: 6 }}>
        <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: color, transition: 'all 0.6s ease' }} />
      </div>
    </div>
  );
}

function ActionTimeline({ actions }) {
  if (!actions.length) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>No activity yet</div>;

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const getActionDisplay = (a) => {
    switch (a.type) {
      case 'gym-start':   return { icon: '🔍', text: `Scraping: ${decodeURIComponent(a.url || '?').slice(0, 40)}`, color: 'var(--accent)' };
      case 'gym-done':    return { icon: '✅', text: `${a.name} (${((a.duration || 0) / 1000).toFixed(1)}s)`, color: 'var(--success)' };
      case 'gym-failed':  return { icon: '❌', text: `${a.isBlock ? 'Blocked' : 'Failed'}: ${a.error?.slice(0, 50) || '?'} (${a.attempt}/${3})`, color: 'var(--danger)' };
      case 'batch-start': return { icon: '📦', text: `Batch ${a.batch} started — ${a.city} (${a.urls} URLs)`, color: 'var(--accent)' };
      case 'batch-done':  return { icon: '🏁', text: `Batch ${a.batch} done — ✅${a.stats?.created || 0} 🔄${a.stats?.updated || 0} ❌${a.stats?.failed || 0}`, color: 'var(--success)' };
      case 'search-start':return { icon: '🔎', text: `Searching: "${a.category}" in ${a.city}`, color: 'var(--cyan)' };
      case 'search-done': return { icon: '📋', text: `Found ${a.found} URLs (${a.total} unique total)`, color: 'var(--cyan)' };
      case 'throttle':    return { icon: a.direction === 'faster' ? '🟢' : '🟡', text: `Throttle → ${a.multiplier?.toFixed(2)}× (${a.direction})`, color: a.direction === 'faster' ? 'var(--success)' : 'var(--warning)' };
      case 'block':       return { icon: '🛑', text: `Google blocked — cooldown ${((a.cooldown || 0) / 1000).toFixed(0)}s`, color: 'var(--danger)' };
      case 'pause':       return { icon: '☕', text: `Human pause ${((a.duration || 0) / 1000).toFixed(1)}s`, color: 'var(--warning)' };
      default:            return { icon: '•', text: JSON.stringify(a).slice(0, 60), color: 'var(--text-muted)' };
    }
  };

  return (
    <div style={{ maxHeight: 220, overflowY: 'auto', scrollbarWidth: 'thin' }}>
      {actions.map((a, i) => {
        const { icon, text, color } = getActionDisplay(a);
        return (
          <div key={`${a.timestamp}-${i}`} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0',
            borderBottom: '1px solid var(--table-border)', fontSize: 12,
            animation: i === 0 ? 'fadeIn 0.3s ease' : undefined,
          }}>
            <span style={{ flexShrink: 0, fontSize: 11, width: 18, textAlign: 'center' }}>{icon}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, minWidth: 55 }}>
              {a.timestamp ? fmtTime(a.timestamp) : ''}
            </span>
            <span style={{ color, flex: 1, lineHeight: 1.4 }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CrawlActivity() {
  const { crawlActivity } = useApp();
  const { currentGym, batch, throttle, recentActions, status } = crawlActivity;
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <motion.div
      className="card crawl-activity-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="card-header">
        <span className="card-title">Live Crawler Activity</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`status-indicator ${cfg.pulse ? 'pulse' : ''}`} style={{ background: cfg.color }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.icon} {cfg.label}</span>
        </div>
      </div>

      {/* Current Activity Banner */}
      <AnimatePresence mode="wait">
        {status !== 'idle' && currentGym && (
          <motion.div
            key={currentGym.url}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="crawl-current"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {status === 'searching' ? `Searching: "${currentGym.url}"` : `Scraping: ${decodeURIComponent(currentGym.url || '').slice(0, 45)}`}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {currentGym.urlIndex + 1}/{currentGym.total}
              </span>
            </div>
            <div className="progress-bar" style={{ height: 4 }}>
              <div className="progress-fill" style={{ width: `${Math.round(((currentGym.urlIndex + 1) / currentGym.total) * 100)}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch + Throttle row */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {batch && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Batch</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              📦 {batch.cityName} — Batch {batch.batchIndex} ({batch.urlCount} URLs)
            </div>
          </div>
        )}
        <ThrottleGauge multiplier={throttle} />
      </div>

      {/* Recent Actions Timeline */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Recent Activity</div>
        <ActionTimeline actions={recentActions} />
      </div>
    </motion.div>
  );
}
