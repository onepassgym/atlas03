import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, XCircle, Trash2, Zap } from 'lucide-react';
import Pagination from '../components/Pagination';
import Skeleton from '../components/Skeleton';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

const LIMIT = 15;
const STATUS_FILTERS = [
  { value: '', label: 'All', icon: '' },
  { value: 'running', label: 'Running', icon: '🔄' },
  { value: 'queued', label: 'Queued', icon: '⏳' },
  { value: 'completed', label: 'Completed', icon: '✅' },
  { value: 'failed', label: 'Failed', icon: '❌' },
  { value: 'cancelled', label: 'Cancelled', icon: '🛑' },
];

export default function Jobs() {
  const { toast, events } = useApp();
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(null); // jobId currently being promoted

  const fetchJobs = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: LIMIT, page: p });
    if (filter) params.set('status', filter);
    try {
      const res = await api.get(`/api/crawl/jobs?${params}`);
      if (res?.success) {
        setJobs(res.jobs || []);
        setTotal(res.total || 0);
        setPage(res.page || p);
      }
    } catch {} finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { fetchJobs(1); }, [filter]);

  // Refresh on relevant SSE events
  useEffect(() => {
    if (events.length > 0 && events[0]?.type?.startsWith('job:') && events[0]?.type !== 'job:progress') {
      setTimeout(() => fetchJobs(page), 500);
    }
  }, [events]);

  const cancelJob = async (jobId) => {
    if (!confirm('Cancel this job?')) return;
    try {
      await api.post(`/api/crawl/cancel/${jobId}`);
      toast('Job cancelled', 'info');
      setTimeout(() => fetchJobs(page), 500);
    } catch { toast('Failed', 'error'); }
  };

  const deleteJob = async (jobId) => {
    try {
      await api.delete(`/api/crawl/jobs/${jobId}`);
      toast('Job deleted', 'info');
      setTimeout(() => fetchJobs(page), 500);
    } catch { toast('Failed', 'error'); }
  };

  const retryFailed = async () => {
    try {
      const res = await api.post('/api/crawl/retry/failed');
      toast(res?.message || 'Retrying', 'success');
      setTimeout(() => fetchJobs(1), 1000);
    } catch { toast('Failed', 'error'); }
  };

  const clearQueue = async () => {
    if (!confirm('⚠️ Cancel ALL queued and running jobs?')) return;
    try {
      const res = await api.post('/api/crawl/queue/clear');
      toast(res?.message || 'Cleared', 'info');
      setTimeout(() => fetchJobs(1), 500);
    } catch { toast('Failed', 'error'); }
  };

  const startNow = async (jobId) => {
    if (!confirm('⚡ Promote this job to run immediately (next available worker)?')) return;
    setPromoting(jobId);
    try {
      const res = await api.post(`/api/crawl/start-now/${jobId}`);
      if (res?.promoted) {
        toast('Job promoted to front of queue!', 'success');
      } else {
        toast(res?.message || 'Action taken', 'info');
      }
      setTimeout(() => fetchJobs(page), 500);
    } catch { toast('Failed to promote job', 'error'); }
    finally { setPromoting(null); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <motion.div className="container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* ── Filter Bar ────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="section-title" style={{ marginBottom: 0, flexShrink: 0 }}>Job History</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`btn sm ${filter === f.value ? 'primary' : ''}`}
              onClick={() => { setFilter(f.value); setPage(1); }}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn sm" onClick={retryFailed}><RefreshCw size={12} /> Retry Failed</button>
          <button className="btn sm danger" onClick={clearQueue}><XCircle size={12} /> Clear Queue</button>
        </div>
      </div>

      {/* ── Jobs Table ────── */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table" id="jobs-table">
          <thead>
            <tr>
              <th>Type</th><th>Name</th><th>Status</th><th>Progress</th>
              <th>New</th><th>Updated</th><th>Failed</th><th>Duration</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9}><Skeleton count={5} height={32} /></td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={9} className="empty-state">No jobs found</td></tr>
            ) : jobs.map(j => {
              const p = j.progress || {};
              const total = p.total || 0;
              const pct = total > 0 ? Math.round(((p.scraped || 0) + (p.failed || 0) + (p.skipped || 0)) / total * 100) : 0;
              const name = j.input?.cityName || j.input?.gymName || j.input?.chainName || 'Unknown';
              const dur = j.durationMs ? `${(j.durationMs / 1000).toFixed(0)}s` : '—';
              return (
                <tr key={j.jobId}>
                  <td><span className={`badge-type ${j.type || 'city'}`}>{j.type || 'city'}</span></td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</td>
                  <td><span className={`badge-status ${j.status}`}>{j.status}</span></td>
                  <td style={{ minWidth: 120 }}>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{pct}% ({total})</span>
                  </td>
                  <td style={{ color: 'var(--success)', fontFamily: 'var(--mono)' }}>{p.newGyms || 0}</td>
                  <td style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{p.updatedGyms || 0}</td>
                  <td style={{ color: 'var(--danger)', fontFamily: 'var(--mono)' }}>{p.failed || 0}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{dur}</td>
                  <td>
                    {j.status === 'queued' && (
                      <button
                        className="btn sm accent"
                        onClick={() => startNow(j.jobId)}
                        disabled={promoting === j.jobId}
                        title="Start immediately (promote to front of queue)"
                        style={{ marginRight: 4 }}
                      >
                        {promoting === j.jobId ? <RefreshCw size={12} className="spin" /> : <Zap size={12} />}
                      </button>
                    )}
                    {(j.status === 'running' || j.status === 'queued') && (
                      <button className="btn sm danger" onClick={() => cancelJob(j.jobId)} title="Cancel"><XCircle size={12} /></button>
                    )}
                    {(j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') && (
                      <button className="btn sm danger" onClick={() => deleteJob(j.jobId)} title="Delete"><Trash2 size={12} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination current={page} total={totalPages} onPage={p => fetchJobs(p)} />
      </div>
    </motion.div>
  );
}
