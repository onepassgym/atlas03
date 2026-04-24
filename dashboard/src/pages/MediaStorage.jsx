import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardDrive, FileImage, RefreshCw, AlertCircle,
  Image as ImageIcon, ChevronLeft, ChevronRight, Filter
} from 'lucide-react';
import { api, getBaseUrl } from '../api/client';
import Skeleton from '../components/Skeleton';

const TYPE_FILTERS = [
  { label: 'All',       value: null       },
  { label: 'Photos',    value: 'photo'    },
  { label: 'Covers',    value: 'cover'    },
  { label: 'Thumbnails',value: 'thumbnail'},
];

function formatBytes(bytes, dec = 1) {
  if (!+bytes) return '0 B';
  const k = 1024, sz = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(dec))} ${sz[i]}`;
}

export default function MediaStorage() {
  const [data, setData]         = useState({ photos: [], pagination: { total:0, pages:1, page:1 }, totalSize:0 });
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);
  const [page, setPage]         = useState(1);
  const [typeFilter, setTypeFilter] = useState(null);
  const [lightbox, setLightbox] = useState(null); // photo object | null

  const fetchPhotos = useCallback(async (pg = page, type = typeFilter, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams({ page: pg, limit: 60 });
      if (type) params.set('type', type);

      const res = await api.get(`/api/gyms/photos?${params}`);
      if (res.success) {
        setData(res);
      } else {
        setError(res.error || 'Failed to load media library');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, typeFilter]);

  useEffect(() => { fetchPhotos(page, typeFilter); }, [page, typeFilter]);

  const handleFilter = (val) => { setTypeFilter(val); setPage(1); };
  const handlePage   = (p)   => setPage(p);

  // Get the best URL to display for a photo
  const getImgSrc = (photo) => {
    const base = getBaseUrl();
    if (photo.thumbnailUrl) return photo.thumbnailUrl.startsWith('http') ? photo.thumbnailUrl : `${base}${photo.thumbnailUrl}`;
    if (photo.publicUrl)    return photo.publicUrl.startsWith('http') ? photo.publicUrl : `${base}${photo.publicUrl}`;
    if (photo.originalUrl)  return photo.originalUrl;
    return null;
  };

  const { photos, pagination, totalSize } = data;

  return (
    <motion.div
      initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
      className="page-container"
      style={{ padding:24, display:'flex', flexDirection:'column', gap:24 }}
    >
      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ padding:12, background:'rgba(16,185,129,0.08)', borderRadius:12, border:'1px solid rgba(16,185,129,0.2)' }}>
            <HardDrive size={26} color="#10b981"/>
          </div>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:900, letterSpacing:-0.5 }}>MEDIA STORAGE</h1>
            <p style={{ margin:'4px 0 0 0', fontSize:12, color:'var(--text-muted)' }}>
              MongoDB gym photo archive · {pagination.total.toLocaleString()} assets
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchPhotos(page, typeFilter, true)}
          disabled={refreshing}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', cursor:'pointer', fontFamily:'var(--font)', fontWeight:600, opacity: refreshing ? 0.6 : 1 }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}/>
          {refreshing ? 'Syncing...' : 'Resync'}
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:14 }}>
        {[
          { label:'Total Photos',  value: pagination.total.toLocaleString(), icon: FileImage, color:'#10b981' },
          { label:'Storage Volume',value: formatBytes(totalSize),            icon: HardDrive, color:'var(--accent)' },
          { label:'This Page',     value: `${photos.length} shown`,          icon: ImageIcon, color:'#f97316' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
            <s.icon size={22} color={s.color}/>
            <div>
              <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{s.label}</div>
              <div style={{ fontSize:22, fontWeight:900, fontFamily:'var(--mono)' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <Filter size={14} color="var(--text-muted)"/>
        {TYPE_FILTERS.map(f => (
          <button
            key={f.label}
            onClick={() => handleFilter(f.value)}
            style={{
              padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
              background:   typeFilter === f.value ? 'var(--accent)' : 'var(--bg-card)',
              color:        typeFilter === f.value ? '#fff'          : 'var(--text-muted)',
              border:       typeFilter === f.value ? '1px solid var(--accent)' : '1px solid var(--border)',
              transition:   'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid #ef4444', padding:16, borderRadius:8, color:'#ef4444', display:'flex', alignItems:'center', gap:10, fontSize:13 }}>
          <AlertCircle size={18}/>{error}
        </div>
      )}

      {/* ── Photo Grid ── */}
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
        {loading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:12 }}>
            {Array(12).fill(0).map((_,i) => <Skeleton key={i} height={140} style={{ borderRadius:8 }}/>)}
          </div>
        ) : photos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-muted)' }}>
            <HardDrive size={48} style={{ opacity:0.15, marginBottom:12 }}/>
            <div style={{ fontSize:14, fontWeight:600 }}>No photos in this category</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:12 }}>
            {photos.map((photo, idx) => {
              const src = getImgSrc(photo);
              return (
                <motion.div
                  key={photo._id}
                  initial={{ opacity:0, scale:0.97 }}
                  animate={{ opacity:1, scale:1 }}
                  transition={{ delay: Math.min(idx*0.02, 0.4) }}
                  onClick={() => setLightbox(photo)}
                  style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', cursor:'pointer', background:'rgba(0,0,0,0.3)', display:'flex', flexDirection:'column' }}
                  whileHover={{ scale:1.02, transition:{duration:0.12} }}
                >
                  <div style={{ width:'100%', aspectRatio:'4/3', background:'rgba(0,0,0,0.2)', position:'relative' }}>
                    {src ? (
                      <img
                        src={src} alt={photo.caption || photo._id}
                        loading="lazy"
                        style={{ width:'100%', height:'100%', objectFit:'cover' }}
                        onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}
                      />
                    ) : null}
                    <div style={{ display: src ? 'none' : 'flex', position:'absolute', inset:0, alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
                      <FileImage size={28} opacity={0.3}/>
                    </div>
                    {/* Type badge */}
                    <div style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.6)', padding:'2px 6px', borderRadius:3, fontSize:9, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:0.5 }}>
                      {photo.type || 'photo'}
                    </div>
                  </div>

                  <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:3 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {photo.gymId?.name || '—'}
                    </div>
                    <div style={{ fontSize:9, color:'var(--text-muted)', fontFamily:'var(--mono)', display:'flex', justifyContent:'space-between' }}>
                      <span>{formatBytes(photo.sizeBytes || 0)}</span>
                      {photo.width && <span>{photo.width}×{photo.height}</span>}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {pagination.pages > 1 && (
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginTop:24, paddingTop:20, borderTop:'1px solid var(--border)' }}>
            <button
              onClick={() => handlePage(page - 1)} disabled={page <= 1}
              style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 14px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, cursor: page <= 1 ? 'not-allowed' : 'pointer', color:'var(--text-primary)', opacity: page <= 1 ? 0.4 : 1 }}
            >
              <ChevronLeft size={14}/> Prev
            </button>

            <span style={{ fontSize:13, color:'var(--text-muted)' }}>
              Page {page} of {pagination.pages} · {pagination.total.toLocaleString()} total
            </span>

            <button
              onClick={() => handlePage(page + 1)} disabled={page >= pagination.pages}
              style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 14px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, cursor: page >= pagination.pages ? 'not-allowed' : 'pointer', color:'var(--text-primary)', opacity: page >= pagination.pages ? 0.4 : 1 }}
            >
              Next <ChevronRight size={14}/>
            </button>
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setLightbox(null)}
            style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter:'blur(8px)' }}
          >
            <motion.div
              initial={{ scale:0.9 }} animate={{ scale:1 }} exit={{ scale:0.9 }}
              onClick={e => e.stopPropagation()}
              style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, maxWidth:820, width:'100%', overflow:'hidden' }}
            >
              <img
                src={getImgSrc(lightbox)} alt={lightbox.caption || ''}
                style={{ width:'100%', maxHeight:'70vh', objectFit:'contain', background:'#000', display:'block' }}
              />
              <div style={{ padding:'14px 20px', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>{lightbox.gymId?.name || 'Unknown gym'}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{lightbox.gymId?.areaName}</div>
                </div>
                <div style={{ textAlign:'right', fontSize:11, color:'var(--text-muted)', fontFamily:'var(--mono)', display:'flex', flexDirection:'column', gap:2 }}>
                  <span>{formatBytes(lightbox.sizeBytes || 0)}</span>
                  {lightbox.width && <span>{lightbox.width} × {lightbox.height}px</span>}
                  <span style={{ textTransform:'uppercase', fontWeight:700 }}>{lightbox.type}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
