import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatCategory(cat) {
  if (!cat) return '?';
  return String(cat).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* ── Event type metadata ─────────────────────────────────── */
const EVENT_META = {
  'crawl:gym-start':    { icon: '⚡', color: '#3b82f6', label: 'Scraping' },
  'crawl:gym-done':     { icon: '✅', color: '#10b981', label: 'Done' },
  'crawl:gym-failed':   { icon: '❌', color: '#ef4444', label: 'Failed' },
  'crawl:batch-start':  { icon: '📦', color: '#8b5cf6', label: 'Batch' },
  'crawl:batch-done':   { icon: '🏁', color: '#10b981', label: 'Batch' },
  'crawl:search-start': { icon: '🔎', color: '#06b6d4', label: 'Discovery' },
  'crawl:search-done':  { icon: '📋', color: '#06b6d4', label: 'Discovery' },
  'crawl:throttle':     { icon: '⚙️', color: '#f59e0b', label: 'Throttle' },
  'crawl:block':        { icon: '🛑', color: '#ef4444', label: 'Block' },
  'crawl:human-pause':  { icon: '☕', color: '#f59e0b', label: 'Pause' },
  'job:queued':         { icon: '📥', color: '#3b82f6', label: 'Job' },
  'job:started':        { icon: '▶️', color: '#3b82f6', label: 'Job' },
  'job:progress':       { icon: '📊', color: '#6b7280', label: 'Progress' },
  'job:completed':      { icon: '✅', color: '#10b981', label: 'Job' },
  'job:failed':         { icon: '💥', color: '#ef4444', label: 'Job' },
  'job:cancelled':      { icon: '🚫', color: '#6b7280', label: 'Job' },
  'job:batches-queued': { icon: '🔀', color: '#8b5cf6', label: 'Job' },
  'gym:created':        { icon: '🆕', color: '#10b981', label: 'Gym' },
  'gym:updated':        { icon: '🔄', color: '#3b82f6', label: 'Gym' },
  'enrichment:started': { icon: '🔬', color: '#06b6d4', label: 'Enrichment' },
  'enrichment:paused':  { icon: '⏸',  color: '#f59e0b', label: 'Enrichment' },
  'enrichment:resumed': { icon: '▶️', color: '#10b981', label: 'Enrichment' },
  'enrichment:priority-pushed': { icon: '⚡', color: '#8b5cf6', label: 'Priority' },
  'schedule:fired':     { icon: '📅', color: '#8b5cf6', label: 'Schedule' },
  'system:startup':     { icon: '🚀', color: '#06b6d4', label: 'System' },
};

function getEventMessage(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'crawl:gym-start':    return `Scraping (${(d.urlIndex||0)+1}/${d.total||'?'}): ${decodeURIComponent(d.url||'?').slice(0,50)}`;
    case 'crawl:gym-done':     return `✓ ${d.gymName} — ${((d.duration||0)/1000).toFixed(1)}s`;
    case 'crawl:gym-failed':   return `${d.isBlock?'Blocked':'Failed'}: ${d.error?.slice(0,60)} (attempt ${d.attempt})`;
    case 'crawl:batch-start':  return `Batch #${d.batchIndex} started — ${d.cityName} · ${d.urlCount} URLs`;
    case 'crawl:batch-done':   return `Batch #${d.batchIndex} done — ✅${d.stats?.created||0} 🔄${d.stats?.updated||0} ❌${d.stats?.failed||0}`;
    case 'crawl:search-start': return `Discovery: "${formatCategory(d.category)}" in ${d.cityName} (${(d.categoryIndex||0)+1}/${d.totalCategories})`;
    case 'crawl:search-done':  return `Found ${d.urlsFound} URLs for "${formatCategory(d.category)}" (${d.totalUnique} unique)`;
    case 'crawl:throttle':     return `Throttle ${d.direction==='faster'?'↓':'↑'} → ${d.multiplier?.toFixed(2)}× (${d.direction})`;
    case 'crawl:block':        return `Google block — cooldown ${((d.cooldownMs||0)/1000).toFixed(0)}s`;
    case 'crawl:human-pause':  return `Human pause ${((d.pauseMs||0)/1000).toFixed(1)}s`;
    case 'job:queued':         return `Queued: ${d.cityName||d.gymName||d.chainName||'?'}`;
    case 'job:started':        return `Started: ${d.cityName||d.gymName||'?'} (${d.mode||'standard'})`;
    case 'job:progress':       return `Progress: ${d.cityName||'?'} — ${d.scraped||0}/${d.total||'?'}`;
    case 'job:completed':      return `Done: ${d.cityName||d.gymName||'?'} (${((d.durationMs||0)/1000).toFixed(0)}s)`;
    case 'job:failed':         return `Failed: ${d.cityName||d.gymName||'?'} — ${d.error||'?'}`;
    case 'job:cancelled':      return `Cancelled: ${d.cityName||d.gymName||'?'}`;
    case 'job:batches-queued': return `${d.batches} batches queued — ${d.cityName} (${d.totalUrls} URLs)`;
    case 'gym:created':        return `New gym: ${d.name} (${d.area||'?'})`;
    case 'gym:updated':        return `Updated: ${d.name}`;
    case 'enrichment:started': return `Enriching: ${d.gymName||d.gymId}`;
    case 'enrichment:paused':  return `Enrichment paused`;
    case 'enrichment:resumed': return `Enrichment resumed`;
    case 'enrichment:priority-pushed': return `Priority queued: ${d.gymName} [${(d.sections||[]).join(', ')}]`;
    case 'schedule:fired':     return `Schedule: ${d.frequency} — ${d.count} jobs queued`;
    case 'system:startup':     return `Server started on :${d.port}`;
    default:                   return `${e.type}: ${JSON.stringify(d).slice(0, 80)}`;
  }
}

/* ── Log level config ────────────────────────────────────── */
const LOG_LEVEL = {
  error: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', dot: '🔴' },
  warn:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', dot: '🟡' },
  info:  { color: 'var(--text-secondary)', bg: 'transparent', border: 'transparent', dot: '⚪' },
};

/* ── Filters ─────────────────────────────────────────────── */
const TABS = [
  { key: 'events', label: 'Live Events' },
  { key: 'logs',   label: 'System Logs' },
];

const EVENT_FILTERS = [
  { key: 'all',        label: 'All',        fn: () => true },
  { key: 'crawl',      label: 'Crawl',      fn: e => e.type?.startsWith('crawl:') },
  { key: 'jobs',       label: 'Jobs',       fn: e => e.type?.startsWith('job:') },
  { key: 'gyms',       label: 'Gyms',       fn: e => e.type?.startsWith('gym:') || e.type?.startsWith('enrichment:') },
];

/* ── Main component ──────────────────────────────────────── */
export default function EventFeed({ maxItems = 80 }) {
  const { events, logs } = useApp();
  const [tab, setTab] = useState('events');
  const [evtFilter, setEvtFilter] = useState('all');
  const [logFilter, setLogFilter] = useState('all'); // all | error | warn | info
  const [expanded, setExpanded] = useState(null);
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Filter out system:log from event feed — those go to System Logs tab
  const filteredEvents = events
    .filter(e => !e.type?.startsWith('system:'))
    .filter(EVENT_FILTERS.find(f => f.key === evtFilter)?.fn || (() => true))
    .slice(0, maxItems);

  const filteredLogs = logs
    .filter(l => logFilter === 'all' || l.level === logFilter)
    .slice(0, maxItems);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setAutoScroll(scrollRef.current.scrollTop < 10);
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [events, logs, autoScroll]);

  return (
    <>
      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: tab === t.key ? 'var(--accent)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            <span style={{ marginLeft: 5, opacity: 0.7, fontFamily: 'var(--mono)', fontSize: 10 }}>
              {t.key === 'events' ? filteredEvents.length : filteredLogs.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Events Tab ── */}
      {tab === 'events' && (
        <>
          {/* Sub-filters */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {EVENT_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setEvtFilter(f.key)}
                style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', border: `1px solid ${evtFilter === f.key ? 'var(--accent)' : 'var(--border)'}`,
                  background: evtFilter === f.key ? 'rgba(59,130,246,0.12)' : 'transparent',
                  color: evtFilter === f.key ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
                {f.key !== 'all' && (
                  <span style={{ marginLeft: 4 }}>
                    {events.filter(e => !e.type?.startsWith('system:')).filter(f.fn).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div ref={scrollRef} onScroll={handleScroll}
            style={{ maxHeight: 380, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {filteredEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
                <div style={{ fontSize: 13 }}>Waiting for events…</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
                  Crawl events appear here in real-time via SSE
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredEvents.map((e, i) => {
                  const meta = EVENT_META[e.type] || { icon: '•', color: 'var(--text-muted)', label: e.type };
                  const key = `${e.timestamp}-${i}`;
                  const isExpanded = expanded === key;
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setExpanded(isExpanded ? null : key)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '6px 8px', borderRadius: 7, marginBottom: 3,
                        cursor: 'pointer', transition: 'background 0.15s',
                        borderLeft: `3px solid ${meta.color}`,
                        background: i === 0 ? `${meta.color}08` : 'transparent',
                      }}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={ev => ev.currentTarget.style.background = i === 0 ? `${meta.color}08` : 'transparent'}
                    >
                      <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1.5 }}>{meta.icon}</span>
                      <span style={{
                        fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--mono)',
                        flexShrink: 0, minWidth: 52, paddingTop: 3,
                      }}>
                        {fmtTime(e.timestamp)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.4px', color: meta.color,
                            background: `${meta.color}18`, padding: '1px 5px', borderRadius: 3,
                          }}>{meta.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {getEventMessage(e)}
                        </div>
                        {isExpanded && (
                          <pre style={{
                            marginTop: 6, padding: '6px 8px', borderRadius: 6,
                            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowX: 'auto',
                          }}>
                            {JSON.stringify(e.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {/* ── System Logs Tab ── */}
      {tab === 'logs' && (
        <>
          {/* Level filter pills */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {['all', 'error', 'warn', 'info'].map(lvl => (
              <button
                key={lvl}
                onClick={() => setLogFilter(lvl)}
                style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', border: `1px solid ${logFilter === lvl ? (LOG_LEVEL[lvl]?.color || 'var(--accent)') : 'var(--border)'}`,
                  background: logFilter === lvl ? `${LOG_LEVEL[lvl]?.color || '#3b82f6'}18` : 'transparent',
                  color: logFilter === lvl ? (LOG_LEVEL[lvl]?.color || 'var(--accent)') : 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.3px', transition: 'all 0.15s',
                }}
              >
                {lvl}
                {lvl !== 'all' && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    {logs.filter(l => l.level === lvl).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔇</div>
                <div style={{ fontSize: 13 }}>No system logs yet</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
                  App-level logs from enrichment, crawl worker, and scheduler appear here
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredLogs.map((log, i) => {
                  const cfg = LOG_LEVEL[log.level] || LOG_LEVEL.info;
                  return (
                    <motion.div
                      key={`${log.timestamp}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '5px 8px', borderRadius: 6, marginBottom: 2,
                        background: cfg.bg, border: `1px solid ${cfg.border}`,
                        fontFamily: 'var(--mono)',
                      }}
                    >
                      <span style={{ flexShrink: 0, fontSize: 11, lineHeight: 1.6 }}>{cfg.dot}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, minWidth: 52, paddingTop: 2 }}>
                        {log.timestamp ? fmtTime(log.timestamp) : ''}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          color: cfg.color, marginRight: 6,
                        }}>[{log.level}]</span>
                        <span style={{ fontSize: 11, color: log.level === 'error' ? cfg.color : 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {log.stack || log.message}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {/* Auto-scroll hint */}
      {!autoScroll && (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <button
            onClick={() => { setAutoScroll(true); if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
            style={{
              fontSize: 10, padding: '3px 12px', borderRadius: 20,
              background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            ↑ Resume live scroll
          </button>
        </div>
      )}
    </>
  );
}
