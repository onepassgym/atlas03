import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import createGlobe from 'cobe';
import { MapPin, Dumbbell, Building2, Globe2, ArrowRight, Maximize2, Minimize2 } from 'lucide-react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';

// ── City markers with real coordinates ──────────────────────
const CITY_MARKERS = [
  { name: 'Mumbai',     coords: [19.076, 72.878],  size: 0.10 },
  { name: 'Delhi',      coords: [28.704, 77.103],  size: 0.10 },
  { name: 'Bengaluru',  coords: [12.972, 77.595],  size: 0.08 },
  { name: 'Hyderabad',  coords: [17.385, 78.487],  size: 0.07 },
  { name: 'Chennai',    coords: [13.083, 80.271],  size: 0.07 },
  { name: 'Kolkata',    coords: [22.573, 88.364],  size: 0.06 },
  { name: 'Pune',       coords: [18.520, 73.857],  size: 0.06 },
  { name: 'Ahmedabad',  coords: [23.023, 72.571],  size: 0.05 },
  { name: 'Jaipur',     coords: [26.913, 75.787],  size: 0.05 },
  { name: 'Lucknow',    coords: [26.847, 80.947],  size: 0.04 },
  { name: 'Goa',        coords: [15.300, 74.124],  size: 0.04 },
  { name: 'Chandigarh', coords: [30.734, 76.779],  size: 0.04 },
  { name: 'Kochi',      coords: [9.932, 76.267],   size: 0.04 },
  { name: 'Surat',      coords: [21.170, 72.831],  size: 0.04 },
  { name: 'Indore',     coords: [22.720, 75.858],  size: 0.04 },
  { name: 'Nagpur',     coords: [21.146, 79.088],  size: 0.03 },
  { name: 'Coimbatore', coords: [11.017, 76.956],  size: 0.03 },
  { name: 'Mysore',     coords: [12.296, 76.639],  size: 0.03 },
  { name: 'Bhopal',     coords: [23.260, 77.413],  size: 0.03 },
  { name: 'Vadodara',   coords: [22.307, 73.181],  size: 0.03 },
];

export default function GlobePage() {
  const { theme, toast } = useApp();
  const canvasRef = useRef(null);
  const pointerDown = useRef(false);
  const pointerDeltaRef = useRef({ x: 0, y: 0 });
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  const widthRef = useRef(0);

  const [stats, setStats] = useState(null);
  const [hoveredCity, setHoveredCity] = useState(null);
  const [cityStats, setCityStats] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const globeContainerRef = useRef(null);

  // Fetch overview stats
  useEffect(() => {
    api.get('/api/gyms/stats').then(res => {
      if (res?.success) {
        setStats(res.stats);
        // Build city lookup
        const lookup = {};
        (res.stats.topCities || []).forEach(c => {
          lookup[c._id?.toLowerCase()] = c.count;
        });
        setCityStats(lookup);
      }
    }).catch(() => {});
  }, []);

  // Globe init with drag support
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
        markers: CITY_MARKERS.map(c => ({
          location: c.coords,
          size: c.size,
        })),
        onRender: (state) => {
          if (!pointerDown.current) {
            currentPhi += 0.003;
          }
          currentPhi += pointerDeltaRef.current.x;
          currentTheta = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, currentTheta + pointerDeltaRef.current.y));
          pointerDeltaRef.current = { x: 0, y: 0 };

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
  }, [theme]);

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
        x: e.movementX / 200,
        y: e.movementY / 200,
      };
    }
  }, []);

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

  const totalGyms = stats?.total || 0;
  const totalCities = stats?.topCities?.length || 0;
  const totalReviews = stats?.totalReviews || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ padding: 0, minHeight: 'calc(100vh - 100px)' }}
    >
      <div
        ref={globeContainerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          minHeight: 'calc(100vh - 100px)',
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
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', maxWidth: 700, aspectRatio: '1',
              touchAction: 'none',
            }}
          />

          {/* ── Fullscreen button ── */}
          <button
            onClick={toggleFullscreen}
            className="btn sm"
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 5 }}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

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
              Drag to explore · Atlas05 Coverage
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
              Interactive visualization of all gym venues indexed by Atlas05. Drag the globe to explore coverage areas.
            </p>
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatBox icon={<Building2 size={16} />} label="Total Gyms" value={totalGyms} color="var(--accent)" />
            <StatBox icon={<MapPin size={16} />} label="Cities" value={totalCities} color="var(--purple)" />
            <StatBox icon={<Dumbbell size={16} />} label="Reviews" value={totalReviews} color="var(--success)" />
            <StatBox icon={<Globe2 size={16} />} label="Markers" value={CITY_MARKERS.length} color="var(--cyan)" />
          </div>

          {/* City List */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2,
              color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Tracked Cities
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 350, overflowY: 'auto' }}>
              {CITY_MARKERS.map(city => {
                const count = cityStats[city.name?.toLowerCase()] || 0;
                const isHovered = hoveredCity === city.name;
                return (
                  <motion.div
                    key={city.name}
                    onHoverStart={() => setHoveredCity(city.name)}
                    onHoverEnd={() => setHoveredCity(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: isHovered ? 'var(--row-hover)' : 'transparent',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: count > 100 ? 'var(--accent)' : count > 30 ? 'var(--success)' : count > 0 ? 'var(--warning)' : 'var(--text-muted)',
                      boxShadow: isHovered ? `0 0 8px ${count > 100 ? 'var(--accent)' : 'var(--success)'}` : 'none',
                      transition: 'box-shadow 0.2s',
                    }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{city.name}</span>
                    <span style={{
                      fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-muted)',
                      fontWeight: 600,
                    }}>
                      {count > 0 ? count.toLocaleString() : '—'}
                    </span>
                    <ArrowRight size={12} style={{
                      color: 'var(--text-muted)', opacity: isHovered ? 1 : 0,
                      transition: 'opacity 0.2s',
                    }} />
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14,
            flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} /> 100+
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} /> 30+
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} /> 1+
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} /> None
            </span>
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
    <div style={{
      padding: '14px 16px', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)', background: 'var(--bg-card)',
      transition: 'border-color 0.2s',
    }}>
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
    </div>
  );
}
