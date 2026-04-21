import { useState, useEffect, useCallback } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, Cell, PieChart, Pie
} from 'recharts';
import { 
  Zap, Clock, CheckCircle2, AlertCircle, Calendar, RefreshCw, 
  History, ArrowRight, BarChart3, Database, ShieldCheck
} from 'lucide-react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

function timeAgo(date) {
  if (!date) return 'never';
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function Enrichment() {
  const { toast } = useApp();
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [mRes, lRes] = await Promise.all([
        api.get('/api/enrichment/metrics?days=7'),
        api.get('/api/enrichment/logs?limit=30')
      ]);
      if (mRes.success) setMetrics(mRes);
      if (lRes.success) setLogs(lRes.logs);
    } catch (e) {
      toast('Failed to load enrichment metrics', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 20 }}>
        <div className="skeleton" style={{ height: 100, marginBottom: 20 }} />
        <div className="grid">
          <div className="skeleton" style={{ height: 300 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </div>
    );
  }

  const dailyData = metrics?.dailyStats || [];
  const fieldData = metrics?.fieldStats || [];
  const totalAttempts = dailyData.reduce((acc, d) => acc + d.success + d.failed, 0);
  const totalSuccess = dailyData.reduce((acc, d) => acc + d.success, 0);
  const successRate = totalAttempts > 0 ? ((totalSuccess / totalAttempts) * 100).toFixed(1) : 0;
  const avgDuration = dailyData.length > 0 
    ? (dailyData.reduce((acc, d) => acc + (d.avgDuration || 0), 0) / dailyData.length / 1000).toFixed(2)
    : 0;

  return (
    <div className="container enrichment-metrics" style={{ paddingBottom: 60 }}>
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            Enrichment Intelligence
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Historical performance and end-to-end processing metrics for gym data enrichment.
          </p>
        </div>
        <button 
          className={`btn secondary ${refreshing ? 'spin' : ''}`} 
          onClick={fetchData} 
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh Metrics'}
        </button>
      </div>

      {/* Hero Stats */}
      <div className="grid" style={{ marginBottom: 24 }}>
        <div className="card stat-card-mini">
          <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)' }}><Zap size={20} /></div>
          <div>
            <div className="stat-label">Success Rate</div>
            <div className="stat-value">{successRate}%</div>
          </div>
        </div>
        <div className="card stat-card-mini">
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}><ShieldCheck size={20} /></div>
          <div>
            <div className="stat-label">Total Successfully Enriched</div>
            <div className="stat-value">{totalSuccess}</div>
          </div>
        </div>
        <div className="card stat-card-mini">
          <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--purple)' }}><Clock size={20} /></div>
          <div>
            <div className="stat-label">Avg Processing Time</div>
            <div className="stat-value">{avgDuration}s</div>
          </div>
        </div>
        <div className="card stat-card-mini">
          <div className="stat-icon" style={{ background: 'rgba(236, 72, 153, 0.1)', color: 'var(--pink)' }}><Database size={20} /></div>
          <div>
            <div className="stat-label">Staleness Checks</div>
            <div className="stat-value">{totalAttempts}</div>
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <BarChart3 size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Processing Activity (7 Days)</h3>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="_id" axisLine={false} tickLine={false} style={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} style={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}
                  itemStyle={{ fontSize: 12 }}
                />
                <Area type="monotone" dataKey="success" stroke="#10b981" fillOpacity={1} fill="url(#colorSuccess)" strokeWidth={2} />
                <Area type="monotone" dataKey="failed" stroke="#ef4444" fillOpacity={0} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <History size={18} style={{ color: 'var(--orange)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Top Field Updates</h3>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={fieldData.slice(0, 8)}>
                <XAxis type="number" hide />
                <YAxis dataKey="_id" type="category" axisLine={false} tickLine={false} width={80} style={{ fontSize: 10 }} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {fieldData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* End-to-End Tracking Logs */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} style={{ color: 'var(--purple)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>End-to-End Enrichment Log</h3>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing last 30 attempts</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="logs-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Gym Name</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Updates</th>
                <th>Discoveries</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log._id || i}>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {timeAgo(log.startedAt)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{log.gymName}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{log.gymId}</div>
                  </td>
                  <td>
                    <span className={`badge ${log.status === 'success' ? 'success' : 'danger'}`}>
                      {log.status === 'success' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                      {log.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                    {(log.durationMs / 1000).toFixed(2)}s
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {log.fieldsUpdated?.slice(0, 3).map(f => (
                        <span key={f} className="mini-chip">{f}</span>
                      ))}
                      {log.fieldsUpdated?.length > 3 && (
                        <span className="mini-chip">+{log.fieldsUpdated.length - 3}</span>
                      )}
                      {(!log.fieldsUpdated || log.fieldsUpdated.length === 0) && log.status === 'success' && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Sync only</span>
                      )}
                      {log.status === 'failed' && (
                        <span style={{ color: 'var(--danger)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                           <AlertCircle size={10} /> {log.error?.slice(0, 40)}...
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                     {(log.photosAdded > 0 || log.reviewsAdded > 0) ? (
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                           {log.photosAdded > 0 && `🖼️ ${log.photosAdded} `}
                           {log.reviewsAdded > 0 && `⭐ ${log.reviewsAdded}`}
                        </span>
                     ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                     )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No enrichment logs found. Start the enrichment worker to see activity.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .stat-card-mini { padding: 16px; display: flex; align-items: center; gap: 14px; }
        .stat-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .stat-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-value { font-size: 20px; font-weight: 800; color: var(--text-primary); margin-top: -2px; }

        .logs-table { width: 100%; border-collapse: collapse; }
        .logs-table th { text-align: left; padding: 12px 20px; font-size: 11px; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); }
        .logs-table td { padding: 12px 20px; border-bottom: 1px solid var(--border); }
        .logs-table tr:last-child td { border-bottom: none; }
        .logs-table tr:hover { background: var(--bg-hover); }

        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .badge.success { background: rgba(16, 185, 129, 0.1); color: var(--success); }
        .badge.danger { background: rgba(239, 68, 68, 0.1); color: var(--danger); }

        .mini-chip { font-size: 9px; padding: 1px 6px; background: var(--border); color: var(--text-secondary); border-radius: 4px; font-weight: 600; }
        
        .spin { animation: spin 2s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
