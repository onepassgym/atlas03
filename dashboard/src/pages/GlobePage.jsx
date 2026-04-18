import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import createGlobe from 'cobe';
import { MapPin, Dumbbell, Building2, Globe2, ArrowRight, Maximize2, Minimize2, Search, Play, Pause } from 'lucide-react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

// ── Fallback Base City Markers ────────────────────────────────────────────────
const BASE_MARKERS = [
  { name: 'Mumbai',     coords: [19.076, 72.878],  size: 0.10 },
  { name: 'Delhi',      coords: [28.704, 77.103],  size: 0.10 },
  { name: 'Bengaluru',  coords: [12.972, 77.595],  size: 0.08 },
  { name: 'Hyderabad',  coords: [17.385, 78.487],  size: 0.07 },
  { name: 'Chennai',    coords: [13.083, 80.271],  size: 0.07 },
  { name: 'Kolkata',    coords: [22.573, 88.364],  size: 0.06 },
  { name: 'Pune',       coords: [18.520, 73.857],  size: 0.06 },
  { name: 'Ahmedabad',  coords: [23.023, 72.571],  size: 0.05 },
  { name: 'Jaipur',     coords: [26.913, 75.787],  size: 0.05 },
];

export default function GlobePage() {
  const { theme, toast } = useApp();
  const canvasRef = useRef(null);
  const pointerDown = useRef(false);
  const pointerDeltaRef = useRef({ x: 0, y: 0 });
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  const widthRef = useRef(0);
  const focusRef = useRef(null); // stores [lat, lng] to focus on
  const isPausedRef = useRef(false);

  const [isPaused, setIsPaused] = useState(false);
  const [zoom, setZoom] = useState(1);

  const [stats, setStats] = useState(null);
  const [hoveredCity, setHoveredCity] = useState(null);
  const [cityStats, setCityStats] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const globeContainerRef = useRef(null);

  // Dynamic Markers State
  const [dynamicMarkers, setDynamicMarkers] = useState(BASE_MARKERS);
  const [newCityName, setNewCityName] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Helper: Geocode a city using Nominatim
  const geocodeCity = async (cityName) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) {
      console.error('Geocoding error:', e);
    }
    return null;
  };

  // Fetch overview stats and dynamically geocode missing top cities
  useEffect(() => {
    api.get('/api/gyms/stats').then(async res => {
      if (res?.success) {
        setStats(res.stats);
        const lookup = {};
        const missingCities = [];

        (res.stats.topCities || []).forEach(c => {
          lookup[c._id?.toLowerCase()] = c.count;
          if (!dynamicMarkers.some(m => m.name.toLowerCase() === c._id.toLowerCase())) {
             missingCities.push(c._id);
          }
        });
        setCityStats(lookup);

        // Fetch coords for up to 5 missing top cities to avoid rate limits
        const toGeocode = missingCities.slice(0, 5);
        if (toGeocode.length > 0) {
          const newMarkers = [];
          for (const city of toGeocode) {
            const coords = await geocodeCity(city);
            if (coords) newMarkers.push({ name: city, coords, size: 0.05 });
            await new Promise(r => setTimeout(r, 600)); // Respect Nominatim limits
          }
          if (newMarkers.length > 0) {
            setDynamicMarkers(prev => [...prev, ...newMarkers]);
          }
        }
      }
    }).catch(() => {});
  }, []); // Only run once on mount

  // Globe init with drag support & focus tracking
  useEffect(() => {
    if (!canvasRef.current) return;
    const isDark = theme === 'dark';

    let currentPhi = phiRef.current;
    let currentTheta = thetaRef.current;
    let globe;

    const onResize = () => {
      if (canvasRef.current) {
        widthRef.current = canvasRef.current.offsetWidth;
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    try {
      globe = createGlobe(canvasRef.current, {
        devicePixelRatio: 2,
        width: widthRef.current * 2 || 1200,
        height: widthRef.current * 2 || 1200,
        phi: currentPhi,
        theta: currentTheta,
        dark: isDark ? 1 : 0,
        diffuse: isDark ? 3 : 2.2,
        mapSamples: 32000,
        mapBrightness: isDark ? 8 : 2,
        baseColor: isDark ? [0.05, 0.06, 0.12] : [0.97, 0.97, 1],
        markerColor: isDark ? [0.2, 0.7, 1] : [0.15, 0.4, 0.95],
        glowColor: isDark ? [0.04, 0.06, 0.15] : [0.82, 0.84, 0.98],
        markers: dynamicMarkers.map(c => ({
          location: c.coords,
          size: c.size,
        })),
        onRender: (state) => {
          // Manual drag mapping
          if (pointerDown.current) {
            currentPhi += pointerDeltaRef.current.x;
            currentTheta = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, currentTheta + pointerDeltaRef.current.y));
            pointerDeltaRef.current = { x: 0, y: 0 };
            focusRef.current = null; // Clear focus if user drags
          } 
          // Animate to focus city
          else if (focusRef.current) {
            const [lat, lng] = focusRef.current;
            // Cobe angle mapping approximation
            const targetPhi = (lng * Math.PI) / 180 + Math.PI; 
            const targetTheta = (lat * Math.PI) / 180;
            
            // Normalize phi difference to take the shortest path
            let dPhi = targetPhi - currentPhi;
            while (dPhi > Math.PI) dPhi -= 2 * Math.PI;
            while (dPhi < -Math.PI) dPhi += 2 * Math.PI;

            currentPhi += dPhi * 0.06;
            currentTheta += (targetTheta - currentTheta) * 0.06;

            if (Math.abs(dPhi) < 0.01 && Math.abs(targetTheta - currentTheta) < 0.01) {
               focusRef.current = null; // Reached target
            }
          } 
          // Auto rotate (if not paused)
          else if (!isPausedRef.current) {
            currentPhi += 0.003;
          }

          // Pulse effect for queued cities (modifies state dynamically)
          const time = Date.now() / 150;
          state.markers = dynamicMarkers.map(c => {
             if (c.isQueued) {
               const pulse = (Math.sin(time) + 1) / 2; // cycles 0 to 1
               return { location: c.coords, size: c.size + pulse * 0.04 };
             }
             return { location: c.coords, size: c.size };
          });

          state.phi = currentPhi;
          state.theta = currentTheta;
          state.width = widthRef.current * 2 || 1200;
          state.height = widthRef.current * 2 || 1200;

          phiRef.current = currentPhi;
          thetaRef.current = currentTheta;
        },
      });
    } catch (e) {
      console.warn('Globe init failed:', e);
    }

    return () => {
      globe?.destroy?.();
      window.removeEventListener('resize', onResize);
    };
  }, [theme, dynamicMarkers]); // Re-init if markers or theme change

  // Pointer drag handlers
  const handlePointerDown = useCallback((e) => {
    pointerDown.current = true;
    e.currentTarget.style.cursor = 'grabbing';
  }, []);

  const handlePointerUp = useCallback((e) => {
    pointerDown.current = false;
    e.currentTarget.style.cursor = 'grab';
  }, []);

  const handlePointerOut = useCallback(() => {
    pointerDown.current = false;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (pointerDown.current) {
      pointerDeltaRef.current = {
        x: e.movementX / (150 * zoom),
        y: e.movementY / (150 * zoom),
      };
    }
  }, [zoom]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.4, Math.min(4, z - e.deltaY * 0.002)));
  }, []);

  // Attach native wheel event listener to prevent default scrolling while zooming
  useEffect(() => {
    const canvasContainer = globeContainerRef.current;
    if (canvasContainer) {
      canvasContainer.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvasContainer.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const togglePause = () => {
     setIsPaused(!isPaused);
     isPausedRef.current = !isPaused;
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      globeContainerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Submit New City to Crawl
  const handleCrawlCity = async (e) => {
    e.preventDefault();
    if (!newCityName.trim() || isGeocoding) return;
    
    const name = newCityName.trim();
    setNewCityName('');
    setIsGeocoding(true);
    toast(`Locating ${name}...`, 'info');

    try {
      // 1. Geocode
      const coords = await geocodeCity(name);
      if (coords) {
         setDynamicMarkers(prev => {
            const copy = prev.filter(m => m.name.toLowerCase() !== name.toLowerCase());
            return [...copy, { name, coords, size: 0.1, isQueued: true }];
         });
         focusRef.current = coords;
         toast(`Located ${name}. Queuing crawl...`, 'success');
      } else {
         toast(`Could not locate ${name} precisely on map.`, 'warning');
      }

      // 2. Schedule Crawl
      const res = await api.post('/api/crawl/city', { cityName: name });
      if (res.success) {
        toast(`Crawl job queued for ${name}`, 'success');
      } else {
        toast(`Failed to queue ${name}`, 'error');
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'error');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleCityClick = (city) => {
     focusRef.current = city.coords;
  };

  const totalGyms = stats?.total || 0;
  const totalCities = stats?.topCities?.length || 0;
  const totalReviews = stats?.totalReviews || 0;

  // Render city list sorted by active vs inactive
  const sortedMarkers = useMemo(() => {
      return [...dynamicMarkers].sort((a, b) => {
         const countA = cityStats[a.name.toLowerCase()] || 0;
         const countB = cityStats[b.name.toLowerCase()] || 0;
         return countB - countA;
      });
  }, [dynamicMarkers, cityStats]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ padding: 0, height: 'calc(100vh - 100px)', overflow: 'hidden' }}
    >
      <div
        ref={globeContainerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          height: '100%',
          background: isFullscreen ? 'var(--bg-primary)' : undefined,
        }}
      >
        {/* ── Globe Canvas ────── */}
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          justifyContent: 'center', overflow: 'hidden', cursor: 'grab',
        }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerOut={handlePointerOut}
          onPointerMove={handlePointerMove}
        >
          <div style={{ 
             position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
             width: '70%', height: '70%', background: 'radial-gradient(circle, var(--accent) 0%, transparent 60%)',
             opacity: 0.1, pointerEvents: 'none', filter: 'blur(40px)'
          }} />
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', maxWidth: 700, aspectRatio: '1',
              touchAction: 'none',
              transform: `scale(${zoom})`,
              transition: 'transform 0.1s ease-out',
            }}
          />

          {/* ── Pause & Fullscreen buttons ── */}
          <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, display: 'flex', gap: 8 }}>
            <button
              onClick={togglePause}
              className="btn sm"
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="btn sm"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>

          {/* ── Center label ── */}
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 2,
              fontFamily: 'var(--mono)',
            }}>
              Drag to explore · Click a city to focus
            </div>
          </div>
        </div>

        {/* ── Sidebar ────── */}
        <div style={{
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(16px)',
          padding: 24,
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Globe2 size={22} style={{ color: 'var(--accent)' }} />
              <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
                Global Coverage
              </h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Interactive visualization of gym venues indexed by Atlas06. 
            </p>
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatBox icon={<Building2 size={16} />} label="Total Gyms" value={totalGyms} color="var(--accent)" />
            <StatBox icon={<MapPin size={16} />} label="Cities" value={totalCities} color="var(--purple)" />
            <StatBox icon={<Dumbbell size={16} />} label="Reviews" value={totalReviews} color="var(--success)" />
            <StatBox icon={<Search size={16} />} label="Markers" value={dynamicMarkers.length} color="var(--cyan)" />
          </div>

          {/* Add New City Form */}
          <form onSubmit={handleCrawlCity} style={{ 
            display: 'flex', gap: 8, padding: 12, 
            background: 'var(--bg-surface)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)' 
          }}>
             <input 
               type="text" 
               className="input" 
               placeholder="Add city to crawl..." 
               value={newCityName}
               onChange={e => setNewCityName(e.target.value)}
               disabled={isGeocoding}
               style={{ flex: 1, background: 'transparent', border: 'none', padding: 4 }}
             />
             <button type="submit" className="btn primary sm" disabled={!newCityName.trim() || isGeocoding} style={{ padding: '6px 12px' }}>
                <Play size={12} fill="currentColor" />
             </button>
          </form>

          {/* City List */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2,
              color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Tracked Cities
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 4 }}>
              <AnimatePresence>
              {sortedMarkers.map((city, i) => {
                const count = cityStats[city.name?.toLowerCase()] || 0;
                const isHovered = hoveredCity === city.name;
                return (
                  <motion.div
                    key={city.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.2 }}
                    onHoverStart={() => setHoveredCity(city.name)}
                    onHoverEnd={() => setHoveredCity(null)}
                    onClick={() => handleCityClick(city)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: isHovered ? 'var(--row-hover)' : 'transparent',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: city.isQueued ? '#f97316' : (count > 100 ? 'var(--accent)' : count > 30 ? 'var(--success)' : count > 0 ? 'var(--warning)' : 'var(--text-muted)'),
                      boxShadow: isHovered ? `0 0 8px ${city.isQueued ? '#f97316' : count > 100 ? 'var(--accent)' : 'var(--success)'}` : 'none',
                      transition: 'box-shadow 0.2s',
                    }} />
                    <span style={{ 
                      flex: 1, fontSize: 13, fontWeight: city.isQueued ? 700 : 500,
                      color: city.isQueued ? '#f97316' : 'inherit'
                    }}>
                      {city.name} {city.isQueued && <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 500, marginLeft: 4 }}>(Queued)</span>}
                    </span>
                    <span style={{
                      fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-muted)',
                      fontWeight: 600,
                    }}>
                      {count > 0 ? count.toLocaleString() : '—'}
                    </span>
                    <ArrowRight size={12} style={{
                      color: 'var(--text-muted)', opacity: isHovered ? 1 : 0,
                      transition: 'opacity 0.2s',
                      transform: isHovered ? 'translateX(0)' : 'translateX(-4px)'
                    }} />
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          </div>
          
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 1fr 340px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </motion.div>
  );
}

function StatBox({ icon, label, value, color }) {
  return (
    <motion.div
      whileHover={{ y: -2, borderColor: color, boxShadow: `0 4px 12px ${color}15` }}
      style={{
        padding: '14px 16px', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', 
        background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-surface) 100%)',
        transition: 'all 0.2s ease',
        cursor: 'default',
        position: 'relative', overflow: 'hidden'
      }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </motion.div>
  );
}

