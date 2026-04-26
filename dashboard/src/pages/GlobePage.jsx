import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import createGlobe from 'cobe';
import { MapPin, Dumbbell, Building2, Globe2, ArrowRight, Maximize2, Minimize2, Search, Play, Pause, Map as MapIcon, Layers, Target, Activity } from 'lucide-react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

// ── Initial Marker (just one to avoid empty state flash) ───────────────────────
const BASE_MARKERS = [
  { name: 'Mumbai', coords: [19.076, 72.878], size: 0.10 },
];

export default function GlobePage() {
  const { theme, toast, events } = useApp();
  const canvasRef = useRef(null);
  const pointerDown = useRef(false);
  const pointerDeltaRef = useRef({ x: 0, y: 0 });
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  const widthRef = useRef(0);
  const focusRef = useRef(null); // stores [lat, lng] to focus on
  const isPausedRef = useRef(false);

  // Auto-Tour references
  const isTouringRef = useRef(false);
  const tourTargetNameRef = useRef(null);

  const [isPaused, setIsPaused] = useState(false);
  const [isTouring, setIsTouring] = useState(false);
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

  // Fetch overview stats and populate markers from accurate DB coordinates
  useEffect(() => {
    api.get('/api/gyms/stats').then(res => {
      if (res?.success && res.stats?.topCities) {
        setStats(res.stats);
        
        const lookup = {};
        const newMarkers = [];
        
        // Find max count to normalize sizes
        let maxCount = 1;
        res.stats.topCities.forEach(c => { if (c.count > maxCount) maxCount = c.count; });

        res.stats.topCities.forEach(c => {
          if (!c._id) return;
          lookup[c._id.toLowerCase()] = c.count;
          
          if (c.lat && c.lng) {
            // Size normalizes between 0.04 and 0.12 based on log scale
            const size = 0.04 + (Math.log(c.count + 1) / Math.log(maxCount + 1)) * 0.08;
            newMarkers.push({
              name: c._id,
              coords: [c.lat, c.lng],
              size,
              count: c.count
            });
          }
        });
        
        setCityStats(lookup);
        if (newMarkers.length > 0) {
          setDynamicMarkers(newMarkers);
          // Make the initial globe pointer/focus dynamic based on the top city in DB
          if (!focusRef.current && newMarkers[0]?.coords) {
            focusRef.current = newMarkers[0].coords;
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
            // Accurate Cobe camera mapping for lat/lng centering
            const targetPhi = Math.PI - (lng * Math.PI) / 180;
            const targetTheta = (lat * Math.PI) / 180;
            
            // Normalize phi difference to take the shortest path
            let dPhi = targetPhi - currentPhi;
            while (dPhi > Math.PI) dPhi -= 2 * Math.PI;
            while (dPhi < -Math.PI) dPhi += 2 * Math.PI;

            currentPhi += dPhi * 0.08;
            currentTheta += (targetTheta - currentTheta) * 0.08;

            if (Math.abs(dPhi) < 0.005 && Math.abs(targetTheta - currentTheta) < 0.005) {
               focusRef.current = null; // Reached target
            }
          } 
          // Auto rotate (if not paused and not touring to a target)
          else if (!isPausedRef.current && !isTouringRef.current) {
            currentPhi += 0.003;
          } else if (isTouringRef.current && !focusRef.current) {
            currentPhi += 0.001; // slow pan while sitting at target
          }

          // Pulse effect for queued cities or active tour target
          const time = Date.now() / 150;
          state.markers = dynamicMarkers.map(c => {
             let size = c.size;
             const isTourTarget = isTouringRef.current && c.name === tourTargetNameRef.current;
             if (c.isQueued || isTourTarget) {
               const pulse = (Math.sin(time * (isTourTarget ? 1.5 : 1)) + 1) / 2; // faster pulse for tour
               size += pulse * (isTourTarget ? 0.08 : 0.04);
             }
             return { location: c.coords, size };
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

  // Autonomous Tour Logic
  useEffect(() => {
    isTouringRef.current = isTouring;
    if (!isTouring || sortedMarkers.length === 0) {
      tourTargetNameRef.current = null;
      setHoveredCity(null);
      return;
    }

    let currentIndex = 0;
    const tourNext = () => {
      const city = sortedMarkers[currentIndex];
      if (city) {
        focusRef.current = city.coords;
        tourTargetNameRef.current = city.name;
        setHoveredCity(city.name);
      }
      currentIndex = (currentIndex + 1) % Math.min(sortedMarkers.length, 15); // Loop through top 15
    };

    tourNext(); // trigger first
    const interval = setInterval(tourNext, 5000); // jump every 5 seconds
    
    return () => clearInterval(interval);
  }, [isTouring, sortedMarkers]);

  const toggleTour = () => setIsTouring(!isTouring);

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
        {/* ── Globe Canvas & CREATIVE OVERLAY ────── */}
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          justifyContent: 'center', overflow: 'hidden', cursor: 'grab',
          background: 'radial-gradient(circle at center, rgba(15, 23, 42, 0.8) 0%, rgba(0,0,0,1) 100%)'
        }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerOut={handlePointerOut}
          onPointerMove={handlePointerMove}
        >
          {/* Creative HUD Components */}
          <TelemetryOverlay isTouring={isTouring} isPaused={isPaused} />

          <div style={{ 
             position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
             width: '70%', height: '70%', background: 'radial-gradient(circle, var(--accent) 0%, transparent 60%)',
             opacity: 0.1, pointerEvents: 'none', filter: 'blur(40px)', zIndex: 0
          }} />
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', maxWidth: 700, aspectRatio: '1',
              touchAction: 'none',
              transform: `scale(${zoom})`,
              transition: 'transform 0.1s ease-out',
              zIndex: 2, position: 'relative'
            }}
          />

          {/* ── Pause & Fullscreen buttons ── */}
          <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 5, display: 'flex', gap: 12 }}>
            <button
              onClick={togglePause}
              className="btn sm"
              style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent)' }}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="btn sm"
              style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent)' }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {/* ── HUD Crosshairs ── */}
          <div style={{ position: 'absolute', pointerEvents: 'none', top: '50%', left: '50%', width: 400, height: 400, transform: 'translate(-50%, -50%)', border: '1px dashed rgba(139, 92, 246, 0.15)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', pointerEvents: 'none', top: '50%', left: '50%', width: 20, height: 20, transform: 'translate(-50%, -50%)' }}>
             <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(139, 92, 246, 0.5)' }} />
             <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(139, 92, 246, 0.5)' }} />
          </div>

          {/* ── Live Animated Events Overlay ── */}
          <div style={{ position: 'absolute', bottom: 100, left: 32, width: 300, pointerEvents: 'none', zIndex: 10 }}>
            <AnimatePresence>
              {events.filter(e => !e.type?.startsWith('system:')).slice(0, 3).map((e, i) => (
                <motion.div
                  key={`${e.timestamp}-${i}`}
                  initial={{ opacity: 0, x: -50, scale: 0.9 }}
                  animate={{ opacity: 1 - (i * 0.25), x: 0, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  style={{
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginBottom: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {e.type.replace('crawl:', '').replace('gym:', '').replace('job:', '')}
                    </div>
                    <div style={{ fontSize: 11, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.data?.gymName || e.data?.cityName || e.data?.name || 'Processing...'}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* ── Center label ── */}
          <div style={{
            position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', pointerEvents: 'none',
            background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(12px)',
            padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(139, 92, 246, 0.2)',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.15)',
            display: 'flex', flexDirection: 'column', alignItems: 'center'
          }}>
            <div style={{
              fontSize: 10, color: isTouring ? 'var(--warning)' : 'var(--accent)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 2,
              fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <span className="live-dot" style={{ background: isTouring ? 'var(--warning)' : 'var(--success)', boxShadow: `0 0 8px ${isTouring ? 'var(--warning)' : 'var(--success)'}` }} /> 
              {isTouring ? 'AUTONOMOUS RECON ACTIVE' : 'SATELLITE LINK ACTIVE'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {isTouring ? 'Scanning high-density targets automatically' : 'Drag to explore · Click city to pinpoint'}
            </div>
          </div>
        </div>

        {/* ── Sidebar HUD ────── */}
        <div style={{
          borderLeft: '1px solid rgba(255,255,255,0.05)',
          background: 'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.7) 100%)',
          backdropFilter: 'blur(20px)',
          padding: '32px 24px',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 24,
          boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
          position: 'relative', zIndex: 10
        }}>
          {/* Decorative HUD Lines */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.5 }} />

          {/* Title and Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ padding: 8, background: 'rgba(139, 92, 246, 0.15)', borderRadius: 12, border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                <Globe2 size={24} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, margin: 0, color: '#fff', textShadow: '0 0 20px rgba(139,92,246,0.4)' }}>
                  ATLAS COMMAND
                </h2>
                <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Global Reconnaissance</div>
              </div>
            </div>
            <button 
              onClick={toggleTour}
              className={`btn sm ${isTouring ? 'primary' : 'secondary'}`}
              style={{
                background: isTouring ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                color: isTouring ? 'var(--warning)' : 'var(--text-muted)',
                borderColor: isTouring ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '6px 10px'
              }}
            >
              <Target size={14} className={isTouring ? 'pulse' : ''} />
              {isTouring ? 'TOURING' : 'AUTO-TOUR'}
            </button>
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StatBox icon={<Building2 size={16} />} label="Total Gyms" value={totalGyms} color="#3b82f6" />
            <StatBox icon={<MapPin size={16} />} label="Cities" value={totalCities} color="#8b5cf6" />
            <StatBox icon={<Dumbbell size={16} />} label="Reviews" value={totalReviews} color="#10b981" />
            <StatBox icon={<Search size={16} />} label="Nodes" value={dynamicMarkers.length} color="#06b6d4" />
          </div>

          {/* Add New City Form */}
          <form onSubmit={handleCrawlCity} style={{ 
            display: 'flex', gap: 8, padding: 4, 
            background: 'rgba(0,0,0,0.3)', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'
          }}>
             <input 
               type="text" 
               className="input" 
               placeholder="Deploy scraper to new city..." 
               value={newCityName}
               onChange={e => setNewCityName(e.target.value)}
               disabled={isGeocoding}
               style={{ flex: 1, background: 'transparent', border: 'none', padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none' }}
             />
             <button type="submit" className="btn accent" disabled={!newCityName.trim() || isGeocoding} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 700 }}>
                {isGeocoding ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}/> : <Play size={14} fill="currentColor" />}
             </button>
          </form>

          {/* City List */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2,
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              Active Nodes
              <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
            </div>
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 8 }}>
              <AnimatePresence>
              {sortedMarkers.map((city, i) => {
                const count = cityStats[city.name?.toLowerCase()] || 0;
                const isHovered = hoveredCity === city.name;
                const isQueued = city.isQueued;
                const color = isQueued ? '#f59e0b' : (count > 100 ? '#8b5cf6' : count > 30 ? '#10b981' : count > 0 ? '#3b82f6' : '#64748b');
                
                return (
                  <motion.div
                    key={city.name}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.3 }}
                    onHoverStart={() => setHoveredCity(city.name)}
                    onHoverEnd={() => setHoveredCity(null)}
                    onClick={() => handleCityClick(city)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: isHovered ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isHovered ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ position: 'relative', width: 10, height: 10 }}>
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
                        boxShadow: `0 0 10px ${color}`, opacity: isHovered ? 1 : 0.7
                      }} />
                      {(isQueued || isHovered) && (
                        <motion.div
                          animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }}
                        />
                      )}
                    </div>
                    
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ 
                        fontSize: 14, fontWeight: isQueued ? 700 : 600,
                        color: isHovered ? '#fff' : 'var(--text-primary)',
                        transition: 'color 0.2s'
                      }}>
                        {city.name}
                      </span>
                      {isQueued && <span style={{ fontSize: 9, color: color, textTransform: 'uppercase', letterSpacing: 1 }}>Locating...</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 13, fontFamily: 'var(--mono)', color: isHovered ? color : 'var(--text-muted)',
                        fontWeight: 700, transition: 'color 0.2s'
                      }}>
                        {count > 0 ? count.toLocaleString() : '—'}
                      </span>
                      <MapPin size={14} style={{
                        color: color, opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.2s, transform 0.2s',
                        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)'
                      }} />
                    </div>
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
        .live-dot {
          width: 6px; height: 6px; background: var(--success); border-radius: 50%;
          box-shadow: 0 0 8px var(--success);
          animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.6); }

        /* ── CREATIVE UI EFFECTS ── */
        .hud-grid {
          position: absolute;
          inset: -100%;
          background-image: 
            linear-gradient(rgba(139, 92, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.1) 1px, transparent 1px);
          background-size: 40px 40px;
          transform: perspective(600px) rotateX(60deg) translateY(-100px) translateZ(-200px);
          animation: grid-move 10s linear infinite;
          opacity: 0.4;
          pointer-events: none;
        }
        @keyframes grid-move {
          0% { transform: perspective(600px) rotateX(60deg) translateY(0) translateZ(-200px); }
          100% { transform: perspective(600px) rotateX(60deg) translateY(40px) translateZ(-200px); }
        }

        .radar-sweep {
          position: absolute;
          top: 50%; left: 50%;
          width: 1000px; height: 1000px;
          margin-top: -500px; margin-left: -500px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, transparent 70%, rgba(139, 92, 246, 0.05) 90%, rgba(139, 92, 246, 0.3) 100%);
          animation: radar-spin 4s linear infinite;
          pointer-events: none;
        }
        @keyframes radar-spin {
          100% { transform: rotate(360deg); }
        }

        .corner-bracket {
          position: absolute;
          width: 40px; height: 40px;
          border: 2px solid rgba(139, 92, 246, 0.4);
          transition: all 0.3s;
        }
        .corner-bracket.top-left { top: 20px; left: 20px; border-right: none; border-bottom: none; }
        .corner-bracket.top-right { top: 20px; right: 20px; border-left: none; border-bottom: none; }
        .corner-bracket.bottom-left { bottom: 20px; left: 20px; border-right: none; border-top: none; }
        .corner-bracket.bottom-right { bottom: 20px; right: 20px; border-left: none; border-top: none; }
      `}</style>
    </motion.div>
  );
}

function TelemetryOverlay({ isTouring, isPaused }) {
  const [hex1, setHex1] = useState('0x0000');
  const [hex2, setHex2] = useState('0x0000');
  const [lat, setLat] = useState('0.0000');
  const [lng, setLng] = useState('0.0000');
  
  useEffect(() => {
    if (isPaused) return;
    const int = setInterval(() => {
      setHex1('0x' + Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0'));
      setHex2('0x' + Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0'));
      setLat((Math.random() * 180 - 90).toFixed(4));
      setLng((Math.random() * 360 - 180).toFixed(4));
    }, 150);
    return () => clearInterval(int);
  }, [isPaused]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      {/* Moving Grid Background */}
      <div className="hud-grid" />
      
      {/* Radar Sweep */}
      {!isPaused && <div className="radar-sweep" />}

      {/* Telemetry Text */}
      <div style={{ position: 'absolute', top: 24, left: 24, color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.8, textShadow: '0 0 8px rgba(139,92,246,0.5)' }}>
        SYS.CORE.OP: {isPaused ? 'STANDBY' : 'NOMINAL'}<br/>
        UPLINK_HASH: <span style={{ color: '#fff' }}>{hex1}</span><br/>
        MEM_OFFSET : <span style={{ color: '#fff' }}>{hex2}</span>
      </div>
      
      <div style={{ position: 'absolute', bottom: 24, right: 24, color: isTouring ? 'var(--warning)' : 'var(--success)', fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.8, textAlign: 'right', textShadow: `0 0 8px ${isTouring ? 'var(--warning)' : 'var(--success)'}` }}>
        TRK_LAT: <span style={{ color: '#fff' }}>{lat}</span><br/>
        TRK_LNG: <span style={{ color: '#fff' }}>{lng}</span><br/>
        <div style={{ marginTop: 4, fontWeight: 700 }}>[{isTouring ? 'AUTO-TRACKING' : 'MANUAL OVERRIDE'}]</div>
      </div>

      {/* Corner Brackets */}
      <div className="corner-bracket top-left" />
      <div className="corner-bracket top-right" />
      <div className="corner-bracket bottom-left" />
      <div className="corner-bracket bottom-right" />
    </div>
  );
}

function StatBox({ icon, label, value, color }) {
  return (
    <motion.div
      whileHover={{ y: -2, borderColor: color, boxShadow: `0 8px 24px ${color}20` }}
      style={{
        padding: '16px', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.05)', 
        background: 'rgba(0,0,0,0.2)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease',
        cursor: 'default',
        position: 'relative', overflow: 'hidden'
      }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: color, opacity: 0.8, boxShadow: `0 0 10px ${color}` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color }}>
        <div style={{ padding: 4, background: `${color}15`, borderRadius: 6 }}>{icon}</div>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{
        fontSize: 26, fontWeight: 900, color: '#fff',
        fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 10px rgba(0,0,0,0.3)'
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </motion.div>
  );
}

