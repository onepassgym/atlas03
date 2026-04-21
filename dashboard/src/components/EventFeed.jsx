import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const CATEGORIES = [
  { key: 'all',     label: 'All',     filter: () => true },
  { key: 'crawl',   label: 'Crawl',   filter: (e) => e.type?.startsWith('crawl:') },
  { key: 'jobs',    label: 'Jobs',    filter: (e) => e.type?.startsWith('job:') },
  { key: 'gyms',    label: 'Gyms',    filter: (e) => e.type?.startsWith('gym:') },
  { key: 'system',  label: 'System',  filter: (e) => e.type?.startsWith('system:') || e.type?.startsWith('schedule:') || e.type?.startsWith('test:') },
];

function getEventConfig(type) {
  const configs = {
    'crawl:gym-start':    { icon: '🔍', color: 'var(--accent)',   severity: 'info' },
    'crawl:gym-done':     { icon: '✅', color: 'var(--success)',  severity: 'success' },
    'crawl:gym-failed':   { icon: '❌', color: 'var(--danger)',   severity: 'error' },
    'crawl:batch-start':  { icon: '📦', color: 'var(--accent)',   severity: 'info' },
    'crawl:batch-done':   { icon: '🏁', color: 'var(--success)',  severity: 'success' },
    'crawl:search-start': { icon: '🔎', color: 'var(--cyan)',     severity: 'info' },
    'crawl:search-done':  { icon: '📋', color: 'var(--cyan)',     severity: 'info' },
    'crawl:throttle':     { icon: '⚡', color: 'var(--warning)',  severity: 'warn' },
    'crawl:block':        { icon: '🛑', color: 'var(--danger)',   severity: 'error' },
    'crawl:human-pause':  { icon: '☕', color: 'var(--warning)',  severity: 'warn' },
    'job:queued':         { icon: '📥', color: 'var(--accent)',   severity: 'info' },
    'job:started':        { icon: '▶️', color: 'var(--accent)',   severity: 'info' },
    'job:progress':       { icon: '📊', color: 'var(--text-muted)', severity: 'info' },
    'job:completed':      { icon: '✅', color: 'var(--success)',  severity: 'success' },
    'job:failed':         { icon: '💥', color: 'var(--danger)',   severity: 'error' },
    'job:cancelled':      { icon: '🛑', color: 'var(--text-muted)', severity: 'warn' },
    'job:batches-queued': { icon: '🔀', color: 'var(--purple)',   severity: 'info' },
    'job:promoted':       { icon: '⚡', color: 'var(--warning)',  severity: 'info' },
    'gym:created':        { icon: '🆕', color: 'var(--success)',  severity: 'success' },
    'gym:updated':        { icon: '🔄', color: 'var(--accent)',   severity: 'info' },
    'schedule:fired':     { icon: '📅', color: 'var(--purple)',   severity: 'info' },
    'system:startup':     { icon: '🚀', color: 'var(--cyan)',     severity: 'info' },
    'test:ping':          { icon: '🧪', color: 'var(--warning)',  severity: 'info' },
  };
  return configs[type] || { icon: '•', color: 'var(--text-muted)', severity: 'info' };
}

function getRichMessage(e) {
  const d = e.data || {};
  switch (e.type) {
    // Crawl events
    case 'crawl:gym-start':    return `Scraping: ${decodeURIComponent(d.url || '?').slice(0, 45)} (${(d.urlIndex || 0) + 1}/${d.total || '?'})`;
    case 'crawl:gym-done':     return <><strong>{d.gymName}</strong> scraped in {((d.duration || 0) / 1000).toFixed(1)}s</>;
    case 'crawl:gym-failed':   return <>{d.isBlock ? 'Blocked' : 'Failed'}: {decodeURIComponent(d.url || '?').slice(0, 30)} — {d.error?.slice(0, 50)} <span style={{ opacity: 0.6 }}>(attempt {d.attempt}/{d.maxRetries})</span></>;
    case 'crawl:batch-start':  return <>Batch {d.batchIndex} started — <strong>{d.cityName}</strong> ({d.urlCount} URLs, {d.pagePool} tabs)</>;
    case 'crawl:batch-done':   return <>Batch {d.batchIndex} done — <strong>{d.cityName}</strong> ✅{d.stats?.created || 0} 🔄{d.stats?.updated || 0} ❌{d.stats?.failed || 0} ({((d.duration || 0) / 1000).toFixed(0)}s)</>;
    case 'crawl:search-start': return <>Searching: "{d.category}" in <strong>{d.cityName}</strong> ({(d.categoryIndex || 0) + 1}/{d.totalCategories})</>;
    case 'crawl:search-done':  return <>{d.error ? `Search failed: ${d.error}` : `Found ${d.urlsFound} URLs for "${d.category}" (${d.totalUnique} unique)`}</>;
    case 'crawl:throttle':     return <>Throttle {d.direction === 'faster' ? '↓' : '↑'} → <strong>{d.multiplier?.toFixed(2)}×</strong> {d.reason === 'google_block' ? '(Google block)' : d.direction === 'faster' ? `(${d.consecutiveSuccess} streak)` : `(${d.consecutiveFails} fails)`}</>;
    case 'crawl:block':        return <>Google block detected — cooldown <strong>{((d.cooldownMs || 0) / 1000).toFixed(0)}s</strong></>;
    case 'crawl:human-pause':  return <>Human pause {((d.pauseMs || 0) / 1000).toFixed(1)}s at URL {d.urlIndex}/{d.total}</>;
    // Job events
    case 'job:queued':         return <>Queued: <strong>{d.cityName || d.gymName || d.chainName || '?'}</strong></>;
    case 'job:started':        return <>Started: <strong>{d.cityName || d.gymName || d.chainName || '?'}</strong> ({d.mode || 'standard'})</>;
    case 'job:progress':       return <>Progress: {d.cityName || '?'} — {d.scraped || 0}/{d.total || '?'}</>;
    case 'job:completed':      return <>Done: <strong>{d.cityName || d.gymName || '?'}</strong> ({((d.durationMs || 0) / 1000).toFixed(0)}s)</>;
    case 'job:failed':         return <>Failed: <strong>{d.cityName || d.gymName || '?'}</strong> — {d.error || '?'}</>;
    case 'job:cancelled':      return <>Cancelled: <strong>{d.cityName || d.gymName || '?'}</strong></>;
    case 'job:batches-queued': return <><strong>{d.batches}</strong> batches queued for {d.cityName} ({d.totalUrls} URLs)</>;
    case 'job:promoted':       return <>Job promoted: <strong>{d.cityName || d.gymName || '?'}</strong></>;
    // Gym events
    case 'gym:created':        return <>New gym: <strong>{d.name}</strong> ({d.area || '?'})</>;
    case 'gym:updated':        return <>Updated: <strong>{d.name}</strong></>;
    // System events
    case 'schedule:fired':     return <>Schedule triggered: {d.frequency} — {d.count} jobs queued</>;
    case 'system:startup':     return <>Server started on :{d.port}</>;
    case 'test:ping':          return <>{d.message || 'Test event'}</>;
    default:                   return <>{e.type}: {JSON.stringify(d).slice(0, 80)}</>;
  }
}

export default function EventFeed({ maxEvents = 80 }) {
  const { events } = useApp();
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef(null);

  const activeFilter = CATEGORIES.find(c => c.key === filter) || CATEGORIES[0];
  const filtered = events.filter(activeFilter.filter).slice(0, maxEvents);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop } = scrollRef.current;
    setAutoScroll(scrollTop < 5);
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  return (
    <>
      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`btn sm ${filter === c.key ? 'primary' : ''}`}
            onClick={() => setFilter(c.key)}
            style={{ fontSize: 10, padding: '3px 10px' }}
          >
            {c.label}
            {c.key !== 'all' && (
              <span style={{ marginLeft: 4, opacity: 0.6, fontFamily: 'var(--mono)' }}>
                {events.filter(c.filter).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ maxHeight: 400, overflowY: 'auto', scrollbarWidth: 'thin' }}
      >
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📡</div>
            <div>Waiting for events…</div>
          </div>
        ) : (
          filtered.map((e, i) => {
            const cfg = getEventConfig(e.type);
            const isExpanded = expanded === `${e.timestamp}-${i}`;
            return (
              <div
                key={`${e.timestamp}-${i}`}
                className="event-row"
                style={{
                  animation: i === 0 ? 'fadeIn 0.4s ease' : undefined,
                  borderLeft: `3px solid ${cfg.color}`,
                  paddingLeft: 10,
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : `${e.timestamp}-${i}`)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{cfg.icon}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', flexShrink: 0, minWidth: 55, marginTop: 2 }}>
                    {fmtTime(e.timestamp)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {getRichMessage(e)}
                    </div>
                    {isExpanded && (
                      <div style={{
                        marginTop: 6, padding: '6px 8px', borderRadius: 6,
                        background: 'var(--log-bg)', border: '1px solid var(--log-border)',
                        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      }}>
                        {JSON.stringify(e.data, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && filtered.length > 5 && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <button
            className="btn sm"
            onClick={() => { setAutoScroll(true); if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
            style={{ fontSize: 10 }}
          >
            ↑ Auto-scroll paused — click to resume
          </button>
        </div>
      )}
    </>
  );
}
