import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Building2, MessageCircle, Camera, Zap, Target, Link2, Activity, TrendingUp } from 'lucide-react';
import StatCard from '../components/StatCard';
import EventFeed from '../components/EventFeed';
import CrawlActivity from '../components/CrawlActivity';
import EnrichmentPanel from '../components/EnrichmentPanel';
import Skeleton from '../components/Skeleton';
import GymRow from '../components/GymRow';
import GymDrawer from '../components/GymDrawer';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#f97316', '#ec4899'];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{payload[0].payload.name || payload[0].payload._id}</div>
      <div style={{ color: 'var(--text-muted)' }}>{payload[0].value} gyms</div>
    </div>
  );
};

export default function Overview() {
  const { events, setChainsCache, crawlActivity } = useApp();
  const [stats, setStats] = useState(null);
  const [queueStats, setQueueStats] = useState(null);
  const [chainStats, setChainStats] = useState({ count: 0, totalLocs: 0 });
  const [latestGyms, setLatestGyms] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedGym, setSelectedGym] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [gymRes, queueRes, chainRes, latestRes, jobsRes] = await Promise.all([
        api.get('/api/gyms/stats').catch(() => null),
        api.get('/api/crawl/queue/stats').catch(() => null),
        api.get('/api/chains').catch(() => ({ chains: [] })),
        api.get('/api/gyms?limit=6&sortBy=createdAt').catch(() => null),
        api.get('/api/crawl/jobs?limit=6').catch(() => null),
      ]);

      if (gymRes?.success) setStats(gymRes.stats);
      if (queueRes?.success) setQueueStats(queueRes.queue);
      if (chainRes?.chains) {
        setChainsCache(chainRes.chains);
        const totalLocs = chainRes.chains.reduce((s, c) => s + (c.totalLocations || 0), 0);
        setChainStats({ count: chainRes.chains.length, totalLocs });
      }
      if (latestRes?.success) setLatestGyms(latestRes.gyms || []);
      if (jobsRes?.success) setJobs(jobsRes.jobs || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [setChainsCache]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const i1 = setInterval(() => api.get('/api/gyms/stats').then(r => r?.success && setStats(r.stats)).catch(() => {}), 30000);
    const i2 = setInterval(() => api.get('/api/crawl/jobs?limit=6').then(r => r?.success && setJobs(r.jobs || [])).catch(() => {}), 15000);
    const i3 = setInterval(() => api.get('/api/gyms?limit=6&sortBy=createdAt').then(r => r?.success && setLatestGyms(r.gyms || [])).catch(() => {}), 20000);
    return () => { clearInterval(i1); clearInterval(i2); clearInterval(i3); };
  }, []);

  // Also refresh jobs on relevant SSE events
  useEffect(() => {
    if (events.length > 0 && events[0]?.type?.startsWith('job:') && events[0]?.type !== 'job:progress') {
      setTimeout(() => api.get('/api/crawl/jobs?limit=6').then(r => r?.success && setJobs(r.jobs || [])).catch(() => {}), 500);
    }
  }, [events]);

  if (loading) return <div className="container"><Skeleton height={100} count={3} /></div>;

  const cityData = (stats?.topCities || []).slice(0, 8).map(c => ({ name: c._id || 'Unknown', count: c.count }));
  const catData = (stats?.byCategory || []).slice(0, 8).map(c => ({ name: c._id || 'Unknown', value: c.count }));

  // Throttle health color
  const throttleColor = crawlActivity.throttle <= 1.0 ? 'green' : crawlActivity.throttle <= 2.0 ? 'yellow' : 'red';
  const throttleLabel = crawlActivity.throttle <= 0.85 ? 'Cruising' : crawlActivity.throttle <= 1.1 ? 'Normal' : crawlActivity.throttle <= 2.0 ? 'Caution' : 'Throttled';

  // Count today's events
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEvents = events.filter(e => new Date(e.timestamp) >= todayStart);
  const todayCreated = todayEvents.filter(e => e.type === 'gym:created').length;
  const todayUpdated = todayEvents.filter(e => e.type === 'gym:updated').length;
  const todayFailed = todayEvents.filter(e => e.type === 'crawl:gym-failed').length;

  return (
    <motion.div className="container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* ── Live Crawler Activity ────── */}
      <CrawlActivity />

      {/* ── Enrichment Engine ────── */}
      <EnrichmentPanel />

      {/* ── Stat Cards ────── */}
      <div className="grid" style={{ marginTop: 14 }}>
        <StatCard title="Total Gyms" value={stats?.total} label="venues in database" icon={<Building2 size={18} />} color="blue" />
        <StatCard title="Total Reviews" value={stats?.totalReviews} label="aggregated insights" icon={<MessageCircle size={18} />} color="purple" />
        <StatCard title="Total Photos" value={stats?.totalPhotos} label="venue images" icon={<Camera size={18} />} color="orange" />
        <StatCard title="Queue Status" value={queueStats?.active ?? 0} label={`${queueStats?.waiting || 0} waiting`} icon={<Zap size={18} />} color="cyan" />
        <StatCard title="Crawl Health" value={crawlActivity.throttle.toFixed(1)} label={throttleLabel} sublabel={crawlActivity.status} icon={<Activity size={18} />} color={throttleColor} />
        <StatCard title="Today" value={todayCreated + todayUpdated} label={`✅${todayCreated} new · 🔄${todayUpdated} upd · ❌${todayFailed} fail`} icon={<TrendingUp size={18} />} color="green" />
      </div>

      {/* ── Charts ────── */}
      <div className="grid-2" style={{ marginTop: 8 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Top Geographies</span><span className="card-icon">📍</span></div>
          {cityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cityData} layout="vertical" margin={{ left: 8, right: 20 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="url(#barGradient)">
                  {cityData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state">No city data</div>}
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Categories</span><span className="card-icon">📊</span></div>
          {catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                  {catData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" height={36} formatter={(v) => <span style={{ fontSize: 10, color: '#94a3b8' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-state">No category data</div>}
        </div>
      </div>

      {/* ── Latest Gyms + Jobs ────── */}
      <div className="grid-2" style={{ marginTop: 8 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Latest Venues</span><span className="card-icon">🆕</span></div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {latestGyms.length > 0 ? latestGyms.map(g => (
              <GymRow key={g._id} gym={g} onClick={setSelectedGym} />
            )) : <div className="empty-state">No gyms yet</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Active & Recent Jobs</span><span className="card-icon">📋</span></div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {jobs.length > 0 ? jobs.map(j => {
              const p = j.progress || {};
              const total = p.total || 0;
              const scraped = (p.scraped || 0) + (p.failed || 0) + (p.skipped || 0);
              const pct = total > 0 ? Math.min(100, Math.round((scraped / total) * 100)) : 0;
              const name = j.input?.cityName || j.input?.gymName || j.input?.chainName || 'Unknown';
              const typeIcon = j.type === 'chain' ? '🔗' : j.type === 'gym_name' ? '🏋' : '🏙️';
              const errorCount = j.errorCount || (j.jobErrors?.length) || 0;
              return (
                <div key={j.jobId} style={{ padding: '10px 0', borderBottom: '1px solid rgba(75,85,99,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{typeIcon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {errorCount > 0 && <span className="error-badge">{errorCount}</span>}
                        <span className={`badge-status ${j.status}`} style={{ fontSize: 10 }}>{j.status}</span>
                      </div>
                    </div>
                    {j.status === 'running' && (
                      <div className="progress-bar" style={{ marginTop: 6 }}>
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--mono)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>Total:{total}</span>
                      <span style={{ color: 'var(--success)' }}>New:{p.newGyms || 0}</span>
                      <span style={{ color: 'var(--danger)' }}>Fail:{p.failed || 0}</span>
                      {p.batches > 0 && <span style={{ color: 'var(--accent)' }}>Batches:{p.batchesDone || 0}/{p.batches}</span>}
                    </div>
                  </div>
                </div>
              );
            }) : <div className="empty-state"><div className="empty-state-icon">📭</div><div>No jobs</div></div>}
          </div>
        </div>
      </div>

      {/* ── Event Feed ────── */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header">
          <span className="card-title">Live Event Feed</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{events.length} events</span>
        </div>
        <EventFeed />
      </div>

      {/* ── Gym Drawer ────── */}
      {selectedGym && <GymDrawer gymId={selectedGym} onClose={() => setSelectedGym(null)} />}
    </motion.div>
  );
}
