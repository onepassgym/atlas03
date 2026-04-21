import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RefreshCw, Zap, Clock, Database, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

function timeAgo(date) {
  if (!date) return 'never';
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function EnrichmentPanel() {
  const { toast, events } = useApp();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/enrichment/status');
      if (res?.success) setStatus(res.enrichment);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll status every 10s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Refresh on enrichment SSE events
  useEffect(() => {
    if (events.length > 0 && events[0]?.type?.startsWith('enrichment:')) {
      setTimeout(fetchStatus, 500);
    }
  }, [events, fetchStatus]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await api.post('/api/enrichment/toggle');
      if (res?.success) {
        toast(res.message, res.paused ? 'info' : 'info');
        await fetchStatus();
      } else {
        toast(res?.error || 'Toggle failed', 'error');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="card enrichment-card" style={{ padding: 16 }}>
        <div style={{ height: 40, background: 'var(--shimmer-from)', borderRadius: 8, animation: 'shimmer 1.5s infinite' }} />
      </div>
    );
  }

  const isPaused = status?.paused ?? true;
  const state = status?.state || 'idle';
  const isRunning = state === 'running';
  const isIdle = state === 'idle' || state === 'stopped';

  const stateIcon = isRunning ? '⚡' : isPaused ? '⏸️' : isIdle ? '💤' : '🔄';
  const stateLabel = isPaused ? 'Paused' : isRunning ? 'Running' : isIdle ? 'Idle' : state;
  const stateColor = isRunning ? 'var(--success)' : isPaused ? 'var(--warning)' : 'var(--text-muted)';

  return (
    <motion.div
      className={`card enrichment-card ${isPaused ? 'paused' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="card-title">Enrichment Engine</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              className={`status-indicator ${isRunning ? 'pulse' : ''}`}
              style={{ background: stateColor }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: stateColor }}>
              {stateIcon} {stateLabel}
            </span>
          </div>
        </div>

        <button
          className={`enrich-toggle-btn ${isPaused ? 'paused' : 'running'} ${isRunning ? 'enrich-pulse' : ''}`}
          onClick={handleToggle}
          disabled={toggling}
          title={isPaused ? 'Resume enrichment' : 'Pause enrichment'}
        >
          {toggling ? (
            <RefreshCw size={14} className="spin" />
          ) : isPaused ? (
            <Play size={14} />
          ) : (
            <Pause size={14} />
          )}
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="enrich-stat">
          <span className="enrich-stat-value" style={{ color: 'var(--success)' }}>
            {status?.processedToday ?? 0}
          </span>
          <span className="enrich-stat-label">Today</span>
        </div>
        <div className="enrich-stat">
          <span className="enrich-stat-value" style={{ color: 'var(--accent)' }}>
            {status?.processedTotal ?? 0}
          </span>
          <span className="enrich-stat-label">Total</span>
        </div>
        <div className="enrich-stat">
          <span className="enrich-stat-value" style={{ color: 'var(--cyan)' }}>
            {status?.totalEligibleGyms ?? 0}
          </span>
          <span className="enrich-stat-label">Eligible</span>
        </div>
        <div className="enrich-stat">
          <span className="enrich-stat-value" style={{ color: 'var(--warning)' }}>
            {status?.staleGyms ?? 0}
          </span>
          <span className="enrich-stat-label">Stale (7d+)</span>
        </div>
        <div className="enrich-stat">
          <span className="enrich-stat-value" style={{ color: 'var(--orange)' }}>
            {status?.priorityQueueLength ?? 0}
          </span>
          <span className="enrich-stat-label">Priority</span>
        </div>
      </div>

      {/* Current / Next info */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* Last enriched */}
        {status?.lastGym && (
          <div className="enrich-next-gym" style={{ flex: 1 }}>
            <span style={{ fontSize: 14 }}>✅</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                Last: {status.lastGym}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {status.lastAction} · {status.lastDuration ? `${(status.lastDuration / 1000).toFixed(1)}s` : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Next in queue */}
        {status?.nextInQueue && (
          <div className="enrich-next-gym" style={{ flex: 1 }}>
            <span style={{ fontSize: 14 }}>⏭️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                Next: {status.nextInQueue.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {status.nextInQueue.area} · Updated {timeAgo(status.nextInQueue.lastUpdated)}
              </div>
            </div>
          </div>
        )}

        {/* Priority queue preview */}
        {status?.priorityQueueLength > 0 && (
          <div className="enrich-next-gym" style={{ flex: 1 }}>
            <Zap size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--orange)' }}>
                {status.priorityQueueLength} Priority Gym{status.priorityQueueLength > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {status.priorityQueue?.slice(0, 3).map(p => p.gymName).filter(Boolean).join(', ') || 'Queued'}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
