import { Star, MessageCircle, Target } from 'lucide-react';

export default function GymRow({ gym, onClick }) {
  return (
    <div className="gym-row" onClick={() => onClick?.(gym._id)} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
      borderBottom: '1px solid rgba(75,85,99,0.15)', cursor: 'pointer',
      transition: 'background 0.15s', borderRadius: 'var(--radius-sm)',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gym.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          <span>{gym.areaName || '—'}</span>
          {gym.chainName && <span style={{ color: 'var(--purple)' }}>🔗 {gym.chainName}</span>}
          {gym.category && <span>{gym.category}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, fontSize: 12, fontFamily: 'var(--mono)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warning)' }}>
          <Star size={12} /> {gym.rating?.toFixed(1) || '—'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
          <MessageCircle size={12} /> {(gym.totalReviews || 0).toLocaleString()}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
          <Target size={12} /> {gym.qualityScore || 0}
        </span>
      </div>
    </div>
  );
}
