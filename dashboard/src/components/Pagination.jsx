export default function Pagination({ current, total, onPage }) {
  if (total <= 1) return null;

  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  const pages = [];

  if (start > 1) pages.push(1);
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('…');
  if (end < total) pages.push(total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
      <button className="btn sm" disabled={current <= 1} onClick={() => onPage(current - 1)}>‹ Prev</button>
      {pages.map((p, i) => (
        typeof p === 'number' ? (
          <button key={i} className={`btn sm ${p === current ? 'primary' : ''}`} onClick={() => onPage(p)}>{p}</button>
        ) : (
          <span key={i} style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{p}</span>
        )
      ))}
      <button className="btn sm" disabled={current >= total} onClick={() => onPage(current + 1)}>Next ›</button>
    </div>
  );
}
