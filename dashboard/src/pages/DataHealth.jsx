import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from 'recharts';
import { ShieldCheck, AlertTriangle, Clock, Zap, Database, Activity, RefreshCw, Heart } from 'lucide-react';
import StatCard from '../components/StatCard';
import HealthRing from '../components/HealthRing';
import ChangeFeed from '../components/ChangeFeed';
import Skeleton from '../components/Skeleton';
import GymRow from '../components/GymRow';
import GymDrawer from '../components/GymDrawer';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

const FIELD_META = {
  phone: { label: 'Phone', icon: '📞', color: '#3b82f6' },
  website: { label: 'Website', icon: '🌐', color: '#8b5cf6' },
  hours: { label: 'Hours', icon: '🕐', color: '#10b981' },
  photos: { label: 'Photos', icon: '📸', color: '#f59e0b' },
  description: { label: 'Description', icon: '📝', color: '#ec4899' },
  rating: { label: 'Rating', icon: '⭐', color: '#ef4444' },
  address: { label: 'Address', icon: '📍', color: '#06b6d4' },
  reviews: { label: 'Reviews', icon: '💬', color: '#f97316' },
  location: { label: 'Location', icon: '🗺️', color: '#6366f1' },
};

const QUALITY_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6'];
const STALENESS_COLORS = { fresh: '#10b981', recent: '#3b82f6', aging: '#f59e0b', stale: '#ef4444' };

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-muted)' }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function DataHealth() {
  const { toast } = useApp();
  const [health, setHealth] = useState(null);
  const [worstGyms, setWorstGyms] = useState([]);
  const [changes, setChanges] = useState([]);
  const [dailyChanges, setDailyChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGym, setSelectedGym] = useState(null);
  const [enrichingIds, setEnrichingIds] = useState(new Set());

  const fetchAll = useCallback(async () => {
    try {
      const [healthRes, worstRes, changesRes, dailyRes] = await Promise.all([
        api.get('/api/data-health/overview').catch(() => null),
        api.get('/api/data-health/worst?limit=10').catch(() => null),
        api.get('/api/data-health/changes/significant?days=30&limit=15').catch(() => null),
        api.get('/api/data-health/changes/daily?days=14').catch(() => null),
      ]);
      if (healthRes?.success) setHealth(healthRes.health);
      if (worstRes?.success) setWorstGyms(worstRes.gyms || []);
      if (changesRes?.success) setChanges(changesRes.changes || []);
      if (dailyRes?.success) setDailyChanges(dailyRes.dailyChanges || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const iv = setInterval(fetchAll, 60000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleEnrichGym = async (gymId, gymName) => {
    setEnrichingIds(prev => new Set(prev).add(gymId));
    try {
      const res = await api.post('/api/enrichment/priority', { gymId, sections: ['all'] });
      if (res?.success) toast(`⚡ ${gymName} queued for enrichment`, 'info');
      else toast(res?.error || 'Enrich failed', 'error');
    } catch (e) { toast(e.message, 'error'); }
    finally { setEnrichingIds(prev => { const n = new Set(prev); n.delete(gymId); return n; }); }
  };

  const handleBatchEnrich = async () => {
    const ids = worstGyms.slice(0, 10).map(g => g._id);
    try {
      const res = await api.post('/api/enrichment/priority/batch', { gymIds: ids, sections: ['all'] });
      if (res?.success) toast(`⚡ ${res.pushed?.length || 0} gyms queued for enrichment`, 'info');
      else toast(res?.error || 'Batch enrich failed', 'error');
    } catch (e) { toast(e.message, 'error'); }
  };

  if (loading) return <div className="container"><Skeleton height={100} count={4} /></div>;
  if (!health) return <div className="container"><div className="empty-state">Failed to load health data</div></div>;

  const h = health;
  const mf = h.missingFields;
  const fieldEntries = Object.entries(mf).sort((a, b) => b[1].pct - a[1].pct);
  const stalenessData = [
    { name: '<7 days', value: h.staleness.fresh, fill: STALENESS_COLORS.fresh },
    { name: '7–30d', value: h.staleness.recent, fill: STALENESS_COLORS.recent },
    { name: '30–90d', value: h.staleness.aging, fill: STALENESS_COLORS.aging },
    { name: '>90d', value: h.staleness.stale, fill: STALENESS_COLORS.stale },
  ];
  const stalenessTotal = stalenessData.reduce((s, d) => s + d.value, 0) || 1;
  const freshPct = Math.round((h.staleness.fresh / stalenessTotal) * 100);
  const enrichPct = h.enrichmentStatus ? Math.round(((h.enrichmentStatus.success || 0) / h.totalGyms) * 100) : 0;
  const reviewPct = Math.round((h.gymsWithReviews / h.totalGyms) * 100);

  return (
    <motion.div className="container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={22} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Data Health Intelligence</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {h.totalGyms.toLocaleString()} venues · Real-time quality monitoring
            </p>
          </div>
        </div>
        <button className="btn accent" onClick={fetchAll} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Health Rings */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-header">
          <span className="card-title">Health Overview</span>
          <span className="card-icon"><Heart size={15} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16, padding: '12px 0' }}>
          <HealthRing value={h.avgCompleteness} label="Completeness" color="#3b82f6" />
          <HealthRing value={freshPct} label="Freshness" color="#10b981" />
          <HealthRing value={enrichPct} label="Enriched" color="#8b5cf6" />
          <HealthRing value={reviewPct} label="Has Reviews" color="#f59e0b" />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid" style={{ marginBottom: 8 }}>
        <StatCard title="Total Venues" value={h.totalGyms} label="in database" icon={<Database size={18} />} color="blue" />
        <StatCard title="Stale Data" value={h.staleness.stale + h.staleness.aging} label={`${h.staleness.stale} critical (>90d)`} icon={<Clock size={18} />} color="orange" />
        <StatCard title="Closed" value={h.closedGyms.permanently + h.closedGyms.temporarily} label={`${h.closedGyms.permanently} permanent · ${h.closedGyms.temporarily} temp`} icon={<AlertTriangle size={18} />} color="red" />
        <StatCard title="Changes (30d)" value={changes.length} label="significant changes" icon={<Activity size={18} />} color="purple" />
      </div>

      {/* Missing Fields + Quality Distribution */}
      <div className="grid-2" style={{ marginBottom: 8 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Missing Data Fields</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              {Math.round(100 - h.avgCompleteness)}% gaps
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
            {fieldEntries.map(([key, data]) => {
              const meta = FIELD_META[key] || { label: key, icon: '•', color: '#6b7280' };
              const pct = data.pct;
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span>{meta.icon}</span> {meta.label}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: pct > 50 ? '#ef4444' : pct > 25 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>
                      {pct}% missing
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>({data.count.toLocaleString()})</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${100 - pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}88)` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Quality Score Distribution</span>
            <span className="card-icon">📊</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={h.qualityDistribution} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Gyms" radius={[6, 6, 0, 0]}>
                {h.qualityDistribution.map((_, i) => (
                  <Cell key={i} fill={QUALITY_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Staleness + Daily Changes */}
      <div className="grid-2" style={{ marginBottom: 8 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Data Freshness</span>
            <span className="card-icon">⏰</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
            {stalenessData.map((d, i) => {
              const pct = Math.round((d.value / stalenessTotal) * 100);
              return (
                <div key={d.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{d.name}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: d.fill, fontWeight: 700 }}>
                      {d.value.toLocaleString()} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 }}
                      style={{ height: '100%', borderRadius: 4, background: d.fill }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Stacked bar summary */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden' }}>
              {stalenessData.map(d => (
                <motion.div
                  key={d.name}
                  initial={{ width: 0 }}
                  animate={{ width: `${(d.value / stalenessTotal) * 100}%` }}
                  transition={{ duration: 1 }}
                  style={{ background: d.fill, height: '100%' }}
                  title={`${d.name}: ${d.value}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Daily Changes (14d)</span>
            <span className="card-icon">📈</span>
          </div>
          {dailyChanges.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyChanges} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="changeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="_id" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="total" name="Changes" stroke="#8b5cf6" fill="url(#changeGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="gymsAffected" name="Gyms" stroke="#3b82f6" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty-state">No change data yet</div>}
        </div>
      </div>

      {/* Change Feed + Worst Gyms */}
      <div className="grid-2" style={{ marginBottom: 8 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Significant Changes</span>
            <span className="card-icon">🔔</span>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            <ChangeFeed changes={changes} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Lowest Quality — Enrich Targets</span>
            <button className="btn" onClick={handleBatchEnrich}
              style={{ fontSize: 10, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(139,92,246,0.15)', color: 'var(--purple)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <Zap size={11} /> Enrich All 10
            </button>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {worstGyms.length > 0 ? worstGyms.map(g => (
              <div key={g._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(75,85,99,0.12)' }}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setSelectedGym(g._id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
                      color: g.qualityScore < 20 ? '#ef4444' : g.qualityScore < 40 ? '#f97316' : '#f59e0b' }}>
                      {g.qualityScore}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {g.areaName || 'Unknown area'}
                    {g.missing?.length > 0 && (
                      <span style={{ marginLeft: 6 }}>
                        Missing: {g.missing.map(m => FIELD_META[m]?.icon || '•').join(' ')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="btn"
                  onClick={() => handleEnrichGym(g._id, g.name)}
                  disabled={enrichingIds.has(g._id)}
                  style={{ fontSize: 10, padding: '3px 8px', flexShrink: 0,
                    background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.2)' }}
                >
                  <Zap size={10} />
                </button>
              </div>
            )) : <div className="empty-state">No gyms found</div>}
          </div>
        </div>
      </div>

      {/* Enrichment Status Breakdown */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-header">
          <span className="card-title">Enrichment Coverage</span>
          <span className="card-icon">🔬</span>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '8px 0' }}>
          {[
            { key: 'success', label: 'Enriched', color: '#10b981', icon: '✅' },
            { key: 'failed', label: 'Failed', color: '#ef4444', icon: '❌' },
            { key: 'never', label: 'Never Enriched', color: '#6b7280', icon: '⏳' },
          ].map(s => {
            const count = h.enrichmentStatus?.[s.key] || 0;
            const pct = Math.round((count / h.totalGyms) * 100);
            return (
              <div key={s.key} style={{ flex: '1 1 140px', padding: 12, borderRadius: 10,
                background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{s.icon} {s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                  {count.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct}% of total</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedGym && <GymDrawer gymId={selectedGym} onClose={() => setSelectedGym(null)} />}
    </motion.div>
  );
}
