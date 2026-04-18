import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, MapPin, Phone, Globe, Map, ExternalLink } from 'lucide-react';
import { api } from '../api/client';

export default function GymDrawer({ gymId, onClose }) {
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gymId) return;
    setLoading(true);
    api.get(`/api/gyms/${gymId}`)
      .then(res => { if (res?.success) setGym(res.gym); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gymId]);

  if (!gymId) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="drawer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div className="drawer-header">
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Gym Details</h3>
          <button onClick={onClose} style={{ fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none', padding: '4px 8px' }}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          {loading ? (
            <div className="empty-state"><div className="empty-state-icon">⏳</div><div>Loading…</div></div>
          ) : !gym ? (
            <div className="empty-state">Failed to load gym details</div>
          ) : (
            <>
              {(gym.photos?.[0]?.url || gym.coverPhoto) && (
                <img
                  src={gym.photos?.[0]?.url || gym.coverPhoto}
                  alt={gym.name}
                  style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}
                  onError={e => e.target.style.display = 'none'}
                />
              )}
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{gym.name}</h2>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--warning)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Star size={14} /> {gym.rating?.toFixed(1) || '—'}
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({(gym.totalReviews || 0).toLocaleString()} reviews)</span>
                </span>
                <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>🎯 Quality: {gym.qualityScore || 0}</span>
                <span style={{ color: (gym.sentimentScore || 0) > 0 ? 'var(--success)' : 'var(--danger)' }}>
                  😊 Sentiment: {gym.sentimentScore?.toFixed(2) || '—'}
                </span>
              </div>
              {gym.chainName && (
                <div style={{ marginBottom: 16 }}>
                  <span style={{ padding: '4px 12px', background: 'rgba(139,92,246,0.15)', color: 'var(--purple)', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>🔗 {gym.chainName}</span>
                </div>
              )}

              <div className="drawer-section">
                <div className="drawer-section-title">Contact & Location</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {gym.address && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} /> {gym.address}</span>}
                  {(gym.contact?.phone || gym.phone) && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={13} /> {gym.contact?.phone || gym.phone}</span>}
                  {(gym.contact?.website || gym.website) && (
                    <a href={gym.contact?.website || gym.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={13} /> {(gym.contact?.website || gym.website).replace(/https?:\/\//, '').slice(0, 40)}
                    </a>
                  )}
                  {gym.googleMapsUrl && (
                    <a href={gym.googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Map size={13} /> View on Google Maps <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">Opening Hours</div>
                {(gym.openingHours || []).length > 0 ? gym.openingHours.map((h, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                    <span>{h.day || h}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{h.hours || ''}</span>
                  </div>
                )) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Not available</span>}
              </div>

              {(gym.amenityIds || []).length > 0 && (
                <div className="drawer-section">
                  <div className="drawer-section-title">Amenities</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {gym.amenityIds.map((a, i) => (
                      <span key={i} style={{ display: 'inline-block', padding: '3px 10px', background: 'rgba(59,130,246,0.1)', borderRadius: 20, fontSize: 11, margin: 2, color: 'var(--accent)' }}>
                        {a.icon || '•'} {a.label || a.slug}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="drawer-section">
                <div className="drawer-section-title">Reviews</div>
                {(gym.reviews || []).length > 0 ? gym.reviews.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(75,85,99,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{r.authorName || 'Anonymous'}</span>
                      <span style={{ color: 'var(--warning)', fontSize: 12 }}>{'⭐'.repeat(Math.min(r.rating || 0, 5))}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {(r.text || r.snippet || '').slice(0, 200)}
                    </div>
                  </div>
                )) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No reviews available</span>}
              </div>

              <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>ID: {gym._id}</div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
