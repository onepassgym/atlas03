import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Download } from 'lucide-react';
import GymRow from '../components/GymRow';
import GymDrawer from '../components/GymDrawer';
import Pagination from '../components/Pagination';
import Skeleton from '../components/Skeleton';
import { api, getBaseUrl } from '../api/client';
import { useApp } from '../context/AppContext';

const LIMIT = 20;

export default function Explorer() {
  const { toast, chainsCache } = useApp();
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [chain, setChain] = useState('');
  const [rating, setRating] = useState('');
  const [sort, setSort] = useState('qualityScore');
  const [minReviews, setMinReviews] = useState('');
  const [chainOnly, setChainOnly] = useState(false);

  const [gyms, setGyms] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedGym, setSelectedGym] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const searchGyms = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', LIMIT);
    params.set('page', p);
    if (search) params.set('search', search);
    if (city) params.set('city', city);
    if (category) params.set('category', category);
    if (chain) params.set('chainSlug', chain);
    if (rating) params.set('minRating', rating);
    if (sort) params.set('sortBy', sort);
    if (minReviews) params.set('minReviews', minReviews);
    if (chainOnly) params.set('isChainMember', 'true');

    try {
      const res = await api.get(`/api/gyms?${params.toString()}`);
      if (res?.success) {
        setGyms(res.gyms || []);
        setTotal(res.total || 0);
        setPage(res.page || 1);
        setPages(res.pages || 1);
      }
    } catch (e) {
      toast('Failed to fetch gyms', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, city, category, chain, rating, sort, minReviews, chainOnly, toast]);

  // Load filter options once
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    api.get('/api/gyms/stats').then(res => {
      if (res?.success) setCategories(res.stats?.byCategory || []);
    }).catch(() => {});
    searchGyms(1);
  }, [loaded, searchGyms]);

  const clearFilters = () => {
    setSearch(''); setCity(''); setCategory(''); setChain(''); setRating('');
    setSort('qualityScore'); setMinReviews(''); setChainOnly(false);
    setTimeout(() => searchGyms(1), 0);
  };

  const handleExport = () => {
    const a = document.createElement('a');
    a.href = `${getBaseUrl()}/api/gyms/export`;
    a.download = 'gyms-export.json';
    a.click();
    toast('Export started…', 'info');
  };

  return (
    <motion.div className="container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* ── Search Bar ────── */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '12px 16px', backdropFilter: 'blur(12px)',
      }}>
        <Search size={18} style={{ color: 'var(--text-muted)' }} />
        <input
          className="input" type="text" placeholder="Search by name, address, or area…"
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchGyms(1)}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14 }}
          id="gym-search-input"
        />
        <button className="btn primary" onClick={() => searchGyms(1)}>Search</button>
        <button className="btn" onClick={handleExport}><Download size={14} /> Export</button>
      </div>

      {/* ── Filters ────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 16,
        padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', backdropFilter: 'blur(12px)',
      }}>
        <FilterGroup label="City / Area">
          <input className="input" type="text" placeholder="e.g. Mumbai" value={city} onChange={e => setCity(e.target.value)} style={{ minWidth: 140, padding: '6px 10px', fontSize: 12 }} />
        </FilterGroup>
        <FilterGroup label="Category">
          <select className="input" value={category} onChange={e => { setCategory(e.target.value); searchGyms(1); }} style={{ minWidth: 150, padding: '6px 10px', fontSize: 12 }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c._id} ({c.count})</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Chain">
          <select className="input" value={chain} onChange={e => { setChain(e.target.value); searchGyms(1); }} style={{ minWidth: 150, padding: '6px 10px', fontSize: 12 }}>
            <option value="">All Chains</option>
            {chainsCache.map(c => <option key={c.slug} value={c.slug}>{c.name} ({c.totalLocations || 0})</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Min Rating">
          <select className="input" value={rating} onChange={e => { setRating(e.target.value); searchGyms(1); }} style={{ minWidth: 80, padding: '6px 10px', fontSize: 12 }}>
            <option value="">Any</option>
            <option value="3">3+</option>
            <option value="3.5">3.5+</option>
            <option value="4">4+</option>
            <option value="4.5">4.5+</option>
          </select>
        </FilterGroup>
        <FilterGroup label="Sort By">
          <select className="input" value={sort} onChange={e => { setSort(e.target.value); searchGyms(1); }} style={{ minWidth: 130, padding: '6px 10px', fontSize: 12 }}>
            <option value="qualityScore">Quality Score</option>
            <option value="rating">Rating</option>
            <option value="totalReviews">Reviews</option>
            <option value="sentimentScore">Sentiment</option>
            <option value="createdAt">Newest</option>
            <option value="name">Name</option>
          </select>
        </FilterGroup>
        <FilterGroup label="Min Reviews">
          <input className="input" type="number" placeholder="0" min="0" value={minReviews} onChange={e => setMinReviews(e.target.value)} style={{ width: 80, padding: '6px 10px', fontSize: 12 }} />
        </FilterGroup>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}>
          <div onClick={() => setChainOnly(!chainOnly)}
            style={{ width: 36, height: 20, background: chainOnly ? 'var(--accent)' : 'rgba(75,85,99,0.4)', borderRadius: 10, position: 'relative', transition: 'background 0.2s', cursor: 'pointer' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: chainOnly ? 18 : 2, transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Chain Only</span>
        </label>
        <button className="btn sm" onClick={clearFilters}><X size={12} /> Clear</button>
      </div>

      {/* ── Results ────── */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {total.toLocaleString()} gyms found
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            Page {page} of {pages}
          </span>
        </div>
        <div style={{ minHeight: 200 }}>
          {loading ? <Skeleton count={6} height={52} style={{ margin: '8px 14px' }} /> : (
            gyms.length > 0 ? gyms.map(g => (
              <GymRow key={g._id} gym={g} onClick={setSelectedGym} />
            )) : (
              <div className="empty-state"><div className="empty-state-icon">🔍</div><div>No gyms match your filters</div></div>
            )
          )}
        </div>
        <Pagination current={page} total={pages} onPage={p => searchGyms(p)} />
      </div>

      {selectedGym && <GymDrawer gymId={selectedGym} onClose={() => setSelectedGym(null)} />}
    </motion.div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}
