import { Database, Zap, Activity, Server, ShieldCheck, Cpu, HardDrive, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../api/client';

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function NetworkTelemetry({ stats, queueStats }) {
  const [vps, setVps] = useState(null);
  const [ping, setPing] = useState(14);
  const [crawlerState, setCrawlerState] = useState('ACTIVE');

  useEffect(() => {
    const fetchVps = async () => {
      const start = Date.now();
      try {
        const [res, stateRes] = await Promise.all([
          api.get('/api/system/vps-stats'),
          api.get('/api/system/state')
        ]);
        const currentPing = Date.now() - start;
        setPing(currentPing);
        
        if (res?.vps) setVps(res.vps);
        if (stateRes?.state) {
          if (stateRes.state.globalPause) setCrawlerState('STANDBY');
          else if (stateRes.state.crawlPace === 'slow') setCrawlerState('SLOW');
          else if (stateRes.state.crawlPace === 'fast') setCrawlerState('FAST');
          else setCrawlerState('ACTIVE');
        }
      } catch {}
    };
    fetchVps();
    const intv = setInterval(fetchVps, 5000);
    return () => clearInterval(intv);
  }, []);
  return (
    <div className="card glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '24px' }}>
      <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <div style={{ padding: 6, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <Server size={16} color="#3b82f6" />
          </div>
          System Telemetry
        </span>
        <span style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontWeight: 800, background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: 12 }}>
          <span className="live-dot" /> NOMINAL
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 6, background: 'var(--bg-surface)', borderRadius: 6 }}><Database size={14} color="var(--text-secondary)" /></div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Data Cluster</span>
          </div>
          <span style={{ fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 800 }}>{(stats?.total || 0).toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>NODES</span></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 6, background: 'var(--bg-surface)', borderRadius: 6 }}><Activity size={14} color="var(--text-secondary)" /></div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>API Gateway</span>
          </div>
          <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: ping < 50 ? 'var(--success)' : 'var(--warning)' }}>{ping}ms <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>PING</span></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 6, background: 'var(--bg-surface)', borderRadius: 6 }}><Zap size={14} color="var(--text-secondary)" /></div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Crawler Engine</span>
          </div>
          <span style={{ 
            fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 800, padding: '2px 8px', borderRadius: 4,
            color: crawlerState === 'STANDBY' ? 'var(--warning)' : crawlerState === 'ACTIVE' ? 'var(--success)' : 'white',
            background: crawlerState === 'STANDBY' ? 'rgba(245, 158, 11, 0.1)' : crawlerState === 'ACTIVE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.2)'
          }}>
            {crawlerState}
          </span>
        </div>

        {vps && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}><Cpu size={12}/> CPU LOAD</div>
              <div style={{ fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 800, color: vps.cpu.usagePercent > 80 ? 'var(--danger)' : 'var(--success)' }}>
                {vps.cpu.usagePercent.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{vps.cpu.cores} Cores</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}><HardDrive size={12}/> RAM USE</div>
              <div style={{ fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 800, color: vps.memory.percent > 85 ? 'var(--warning)' : 'var(--accent)' }}>
                {vps.memory.percent.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{formatBytes(vps.memory.used)} / {formatBytes(vps.memory.total)}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}><Clock size={12}/> UPTIME</div>
              <div style={{ fontSize: 16, fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                {formatUptime(vps.uptime)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="live-dot" style={{width: 6, height: 6, background: 'var(--success)', borderRadius: '50%'}}></span> ACTIVE
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
