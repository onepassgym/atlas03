import { useApp } from '../context/AppContext';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getCategory(type) {
  if (type?.startsWith('job:')) return 'job';
  if (type?.startsWith('gym:')) return 'gym';
  if (type?.startsWith('schedule:')) return 'schedule';
  if (type?.startsWith('system:')) return 'system';
  if (type?.includes('fail') || type?.includes('error')) return 'error';
  return 'test';
}

const dotColors = {
  job: 'var(--accent)', gym: 'var(--success)', schedule: 'var(--purple)',
  system: 'var(--cyan)', error: 'var(--danger)', test: 'var(--warning)',
};

function getMessage(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'job:queued':     return `Queued: ${d.cityName || d.gymName || d.chainName || 'unknown'} (${d.jobId?.slice(0, 8) || '?'})`;
    case 'job:started':    return `Started: ${d.cityName || d.gymName || d.chainName || 'unknown'}`;
    case 'job:progress':   return `Progress: ${d.cityName || d.chainName || '?'} — ${d.scraped || 0}/${d.total || '?'}`;
    case 'job:completed':  return `✅ Done: ${d.cityName || d.gymName || d.chainName || '?'} — ${d.created || 0} new`;
    case 'job:failed':     return `❌ Failed: ${d.cityName || d.gymName || d.chainName || '?'} — ${d.error || 'unknown'}`;
    case 'job:cancelled':  return `🛑 Cancelled: ${d.cityName || d.gymName || d.chainName || '?'}`;
    case 'gym:created':    return `New: ${d.name || '?'} (${d.area || d.chain || '?'})`;
    case 'gym:updated':    return `Updated: ${d.name || '?'}`;
    case 'schedule:fired': return `📅 ${d.frequency || '?'} — ${d.count || 0} queued`;
    case 'system:startup': return `🚀 Server started on :${d.port || '?'}`;
    case 'test:ping':      return `🧪 ${d.message || 'Test event'}`;
    default:               return `${e.type}: ${JSON.stringify(d).slice(0, 80)}`;
  }
}

export default function EventFeed({ maxEvents = 50 }) {
  const { events } = useApp();

  return (
    <div style={{ maxHeight: 400, overflowY: 'auto', scrollbarWidth: 'thin' }}>
      {events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📡</div>
          <div>Waiting for events…</div>
        </div>
      ) : (
        events.slice(0, maxEvents).map((e, i) => {
          const cat = getCategory(e.type);
          return (
            <div key={`${e.timestamp}-${i}`} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
              borderBottom: '1px solid rgba(75,85,99,0.15)', animation: i === 0 ? 'fadeIn 0.4s ease' : undefined, fontSize: 13,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: dotColors[cat] || 'var(--text-muted)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)', flexShrink: 0, minWidth: 65 }}>
                {fmtTime(e.timestamp)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{e.type}</div>
                <div style={{ color: 'var(--text-primary)' }}>{getMessage(e)}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
