import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import { useApp } from '../context/AppContext';

export default function Globe() {
  const canvasRef = useRef(null);
  const { theme } = useApp();

  useEffect(() => {
    if (!canvasRef.current) return;
    let phi = 0;
    let globe;
    const isDark = theme === 'dark';
    try {
      globe = createGlobe(canvasRef.current, {
        devicePixelRatio: 2,
        width: 2000,
        height: 2000,
        phi: 0,
        theta: 0.3,
        dark: isDark ? 1 : 0,
        diffuse: isDark ? 1.2 : 2.5,
        mapSamples: 16000,
        mapBrightness: isDark ? 6 : 1.5,
        baseColor: isDark ? [0.08, 0.08, 0.1] : [1, 1, 1],
        markerColor: isDark ? [0.1, 0.8, 1] : [0.15, 0.35, 0.9],
        glowColor: isDark ? [0.03, 0.03, 0.05] : [0.85, 0.85, 0.95],
        markers: [
          { location: [19.076, 72.878], size: 0.08 },
          { location: [28.704, 77.103], size: 0.08 },
          { location: [12.972, 77.595], size: 0.06 },
          { location: [17.385, 78.487], size: 0.05 },
          { location: [13.083, 80.271], size: 0.05 },
          { location: [22.573, 88.364], size: 0.05 },
          { location: [18.520, 73.857], size: 0.04 },
        ],
        onRender: (state) => {
          state.phi = phi;
          phi += 0.003;
        },
      });
    } catch (e) {
      console.warn('Globe init failed:', e);
    }
    return () => globe?.destroy?.();
  }, [theme]);

  return (
    <div className="globe-canvas-container">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
