import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Tag, Rocket } from 'lucide-react';
import ChainCard from '../components/ChainCard';
import GymRow from '../components/GymRow';
import GymDrawer from '../components/GymDrawer';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import Skeleton from '../components/Skeleton';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

export default function Chains() {
  const { toast, chainsCache, setChainsCache } = useApp();
  const [chains, setChains] = useState([]);
  const [queueStats, setQueueStats] = useState({});
  const [loading, setLoading] = useState(true);

  // Chain gyms panel
  const [selectedChainSlug, setSelectedChainSlug] = useState(null);
  const [selectedChainName, setSelectedChainName] = useState('');
  const [chainGyms, setChainGyms] = useState([]);
  const [chainGymsTotal, setChainGymsTotal] = useState(0);
  const [chainGymsPage, setChainGymsPage] = useState(1);
  const [chainGymsCountry, setChainGymsCountry] = useState('');

  // Modals
  const [crawlModalOpen, setCrawlModalOpen] = useState(false);
  const [crawlSlug, setCrawlSlug] = useState('');
  const [crawlCountries, setCrawlCountries] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newChain, setNewChain] = useState({ name: '', slug: '', aliases: '', website: '' });

  // Gym detail
  const [selectedGym, setSelectedGym] = useState(null);

  const fetchChains = useCallback(async () => {
    try {
      const [chainRes, qRes] = await Promise.all([
        api.get('/api/chains'),
        api.get('/api/chains/crawl/queue-stats').catch(() => ({ queue: {} })),
      ]);
      if (chainRes?.success) {
        setChains(chainRes.chains || []);
        setChainsCache(chainRes.chains || []);
      }
      if (qRes?.queue) setQueueStats(qRes.queue);
    } catch {} finally {
      setLoading(false);
    }
  }, [setChainsCache]);

  useEffect(() => { fetchChains(); }, [fetchChains]);

  const handleCrawl = (slug, name) => {
    setCrawlSlug(slug);
    setCrawlModalOpen(true);
  };

  const submitCrawl = async () => {
    setCrawlModalOpen(false);
    try {
      const countries = crawlCountries ? crawlCountries.split(',').map(c => c.trim()).filter(Boolean) : [];
      const res = await api.post('/api/chains/crawl/start', { chainSlug: crawlSlug, countries });
      toast(res?.message || 'Chain crawl queued', res?.success !== false ? 'success' : 'error');
      setTimeout(fetchChains, 1000);
    } catch { toast('Network error', 'error'); }
    setCrawlCountries('');
  };

  const handleTag = async (slug) => {
    try {
      const res = await api.post(`/api/chains/${slug}/tag`);
      toast(res?.message || 'Tagged', 'success');
      setTimeout(fetchChains, 500);
    } catch { toast('Failed', 'error'); }
  };

  const handleTagAll = async () => {
    if (!confirm('Tag all existing gyms with matching chain names?')) return;
    try {
      const res = await api.post('/api/chains/tag-existing');
      toast(res?.message || 'Tagged', 'success');
      setTimeout(fetchChains, 500);
    } catch { toast('Failed', 'error'); }
  };

  const submitAddChain = async () => {
    if (!newChain.name || !newChain.slug) { toast('Name and slug required', 'error'); return; }
    setAddModalOpen(false);
    try {
      const body = {
        name: newChain.name,
        slug: newChain.slug,
        aliases: newChain.aliases ? newChain.aliases.split(',').map(a => a.trim()) : [],
        website: newChain.website,
      };
      const res = await api.post('/api/chains', body);
      toast(res?.message || 'Chain created', 'success');
      setNewChain({ name: '', slug: '', aliases: '', website: '' });
      setTimeout(fetchChains, 500);
    } catch { toast('Failed', 'error'); }
  };

  const viewChainGyms = async (slug, name) => {
    setSelectedChainSlug(slug);
    setSelectedChainName(name);
    setChainGymsPage(1);
    setChainGymsCountry('');
    await loadChainGyms(slug, 1, '');
  };

  const loadChainGyms = async (slug, p = chainGymsPage, country = chainGymsCountry) => {
    const params = new URLSearchParams({ page: p, limit: 20 });
    if (country) params.set('country', country);
    try {
      const res = await api.get(`/api/chains/${slug || selectedChainSlug}/gyms?${params}`);
      if (res?.success) {
        setChainGyms(res.gyms || []);
        setChainGymsTotal(res.total || 0);
      }
    } catch {}
  };

  return (
    <motion.div className="container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* ── Header ────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Registered Gym Chains</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleTagAll}><Tag size={14} /> Tag Existing Gyms</button>
          <button className="btn primary" onClick={() => setAddModalOpen(true)}><Plus size={14} /> Add Chain</button>
        </div>
      </div>

      {/* ── Chain Grid ────── */}
      {loading ? <Skeleton count={3} height={140} /> : (
        <div className="grid-3">
          {chains.map(c => (
            <ChainCard key={c.slug} chain={c} onCrawl={handleCrawl} onViewGyms={viewChainGyms} onTag={handleTag} />
          ))}
          {chains.length === 0 && <div className="empty-state"><div className="empty-state-icon">⏳</div><div>No chains registered</div></div>}
        </div>
      )}

      {/* ── Queue Stats ────── */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header">
          <span className="card-title">Chain Crawl Queue</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            Active:{queueStats.active || 0} Waiting:{queueStats.waiting || 0} Done:{queueStats.completed || 0} Failed:{queueStats.failed || 0}
          </span>
        </div>
      </div>

      {/* ── Chain Gyms Panel ────── */}
      {selectedChainSlug && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title">Chain Locations: {selectedChainName}</span>
            <button className="btn sm" onClick={() => setSelectedChainSlug(null)}>✕ Close</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <input className="input" type="text" placeholder="Filter by country (e.g. India)" value={chainGymsCountry} onChange={e => setChainGymsCountry(e.target.value)} style={{ maxWidth: 200 }} />
            <button className="btn sm" onClick={() => { setChainGymsPage(1); loadChainGyms(selectedChainSlug, 1, chainGymsCountry); }}>Filter</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{chainGymsTotal} locations</span>
          </div>
          <div>
            {chainGyms.length > 0 ? chainGyms.map(g => (
              <GymRow key={g._id} gym={g} onClick={setSelectedGym} />
            )) : <div className="empty-state"><div className="empty-state-icon">📭</div><div>No locations found</div></div>}
          </div>
          <Pagination current={chainGymsPage} total={Math.ceil(chainGymsTotal / 20)} onPage={p => { setChainGymsPage(p); loadChainGyms(selectedChainSlug, p, chainGymsCountry); }} />
        </div>
      )}

      {/* ── Crawl Modal ────── */}
      <Modal open={crawlModalOpen} onClose={() => setCrawlModalOpen(false)} title={`🔗 Crawl Chain`}>
        <select className="input" value={crawlSlug} onChange={e => setCrawlSlug(e.target.value)}>
          {chains.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <input className="input" type="text" placeholder="Countries (optional, comma-sep): IN, US, AU" value={crawlCountries} onChange={e => setCrawlCountries(e.target.value)} />
        <div className="modal-actions">
          <button className="btn" onClick={() => setCrawlModalOpen(false)}>Cancel</button>
          <button className="btn primary" onClick={submitCrawl}><Rocket size={14} /> Start Crawl</button>
        </div>
      </Modal>

      {/* ── Add Chain Modal ────── */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="+ Register New Chain">
        <input className="input" placeholder="Chain name (e.g. Equinox)" value={newChain.name} onChange={e => setNewChain({...newChain, name: e.target.value})} />
        <input className="input" placeholder="Slug (e.g. equinox)" value={newChain.slug} onChange={e => setNewChain({...newChain, slug: e.target.value})} />
        <input className="input" placeholder="Aliases (comma-sep)" value={newChain.aliases} onChange={e => setNewChain({...newChain, aliases: e.target.value})} />
        <input className="input" placeholder="Website URL" value={newChain.website} onChange={e => setNewChain({...newChain, website: e.target.value})} />
        <div className="modal-actions">
          <button className="btn" onClick={() => setAddModalOpen(false)}>Cancel</button>
          <button className="btn primary" onClick={submitAddChain}>Create Chain</button>
        </div>
      </Modal>

      {selectedGym && <GymDrawer gymId={selectedGym} onClose={() => setSelectedGym(null)} />}
    </motion.div>
  );
}
