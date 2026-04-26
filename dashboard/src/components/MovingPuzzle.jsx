import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X, HelpCircle, Info, Zap, Clock, Keyboard, ShieldCheck, Activity } from 'lucide-react';
import { SIM, simCard, simHeader, simFooter, simIconBtn, simStatus, useGameMobileFix, MobileDPad } from './simUI';

const LEVELS = {
  E: { size: 2, label: 'EASY',       scramble: 20  },
  M: { size: 3, label: 'MEDIUM',     scramble: 50  },
  H: { size: 4, label: 'HARD',       scramble: 100 },
  I: { size: 5, label: 'IMPOSSIBLE', scramble: 200 },
};

const ACCENT_RGB = '16, 185, 129'; // green

export default function MovingPuzzle() {
  const [level, setLevel] = useState('M');
  const size = LEVELS[level].size;

  const SOLVED_GRID = useMemo(() => {
    const arr = Array.from({ length: size * size - 1 }, (_, i) => i + 1);
    arr.push(0);
    return arr;
  }, [size]);

  const [grid, setGrid]               = useState(SOLVED_GRID);
  const [cracked, setCracked]         = useState(false);
  const [moves, setMoves]             = useState(0);
  const [score, setScore]             = useState(0);
  const [startTime, setStartTime]     = useState(null);
  const [time, setTime]               = useState(0);
  const [showRules, setShowRules]     = useState(false);
  const [showHint, setShowHint]       = useState(false);
  const [lastMovedValue, setLastMovedValue] = useState(null);
  const [isGlitching, setIsGlitching] = useState(false);
  const [isActive, setIsActive]       = useState(false);

  const stateRef = useRef({ grid, showRules, cracked, isActive, size });
  const gameRef = useRef(null);
  useEffect(() => {
    stateRef.current = { grid, showRules, cracked, isActive, size };
  }, [grid, showRules, cracked, isActive, size]);

  useEffect(() => {
    let interval;
    if (startTime && !cracked) {
      interval = setInterval(() => setTime(Math.floor((Date.now() - startTime) / 1000)), 1000);
    }
    return () => clearInterval(interval);
  }, [startTime, cracked]);

  useEffect(() => {
    setGrid(SOLVED_GRID);
    setCracked(false); setMoves(0); setScore(0); setTime(0);
    setStartTime(null); setShowHint(false);
    triggerGlitch();
  }, [SOLVED_GRID]);

  const triggerGlitch = () => { setIsGlitching(true); setTimeout(() => setIsGlitching(false), 300); };

  const calculateHeuristic = useCallback((state) => {
    let dist = 0;
    state.forEach((val, i) => {
      if (val === 0) return;
      const tIdx = val - 1;
      dist += Math.abs(Math.floor(tIdx / size) - Math.floor(i / size)) + Math.abs((tIdx % size) - (i % size));
    });
    for (let r = 0; r < size; r++) {
      for (let c1 = 0; c1 < size; c1++) {
        for (let c2 = c1 + 1; c2 < size; c2++) {
          const v1 = state[r * size + c1], v2 = state[r * size + c2];
          if (v1 !== 0 && v2 !== 0) {
            const t1 = v1 - 1, t2 = v2 - 1;
            if (Math.floor(t1 / size) === r && Math.floor(t2 / size) === r && t1 > t2) dist += 2;
          }
        }
      }
    }
    return dist;
  }, [size]);

  const progress = useMemo(() => {
    if (cracked) return 100;
    const h = calculateHeuristic(grid);
    const maxH = size * size * size;
    return Math.max(5, Math.min(95, 100 - (h / maxH) * 100));
  }, [grid, calculateHeuristic, size, cracked]);

  const hintTile = useMemo(() => {
    if (cracked) return null;
    const emptyIdx = grid.indexOf(0);
    const rE = Math.floor(emptyIdx / size), cE = emptyIdx % size;
    const neighbors = [];
    if (rE > 0) neighbors.push(emptyIdx - size);
    if (rE < size - 1) neighbors.push(emptyIdx + size);
    if (cE > 0) neighbors.push(emptyIdx - 1);
    if (cE < size - 1) neighbors.push(emptyIdx + 1);
    let bestT = -1, minH = Infinity;
    neighbors.forEach(idx => {
      const val = grid[idx];
      if (val === lastMovedValue && neighbors.length > 1) return;
      const temp = [...grid];
      [temp[emptyIdx], temp[idx]] = [temp[idx], temp[emptyIdx]];
      const h = calculateHeuristic(temp);
      if (h < minH) { minH = h; bestT = val; }
      else if (h === minH && (bestT === -1 || val < bestT)) { bestT = val; }
    });
    return bestT;
  }, [grid, size, cracked, calculateHeuristic, lastMovedValue]);

  const moveTile = useCallback((targetIdx) => {
    if (cracked) return;
    setGrid(prev => {
      const emptyIdx = prev.indexOf(0);
      const rowT = Math.floor(targetIdx / size), colT = targetIdx % size;
      const rowE = Math.floor(emptyIdx / size), colE = emptyIdx % size;
      if (Math.abs(rowT - rowE) + Math.abs(colT - colE) !== 1) return prev;
      if (!startTime) setStartTime(Date.now());
      const val = prev[targetIdx];
      setLastMovedValue(val);
      if (showHint && val === hintTile) { setScore(s => s + 150); setShowHint(false); }
      else { setScore(s => s + 10); }
      setMoves(m => m + 1);
      const next = [...prev];
      [next[emptyIdx], next[targetIdx]] = [next[targetIdx], next[emptyIdx]];
      return next;
    });
  }, [size, showHint, hintTile, cracked, startTime]);

  useEffect(() => {
    const handleKey = (e) => {
      const { grid: g, showRules: r, cracked: c, isActive: act, size: s } = stateRef.current;
      if (!act || r || c) return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
      
      let dir = null;
      if (e.key === 'ArrowUp') dir = 'up';
      if (e.key === 'ArrowDown') dir = 'down';
      if (e.key === 'ArrowLeft') dir = 'left';
      if (e.key === 'ArrowRight') dir = 'right';
      
      if (dir) handleDirection(dir);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [moveTile]);

  const handleDirection = useCallback((dir) => {
    const { grid: g, showRules: r, cracked: c, isActive: act, size: s } = stateRef.current;
    if (!act || r || c) return;
    const emptyIdx = g.indexOf(0);
    const rowE = Math.floor(emptyIdx / s), colE = emptyIdx % s;
    let target = -1;
    if (dir === 'up'    && rowE < s - 1) target = emptyIdx + s;
    if (dir === 'down'  && rowE > 0)     target = emptyIdx - s;
    if (dir === 'left'  && colE < s - 1) target = emptyIdx + 1;
    if (dir === 'right' && colE > 0)     target = emptyIdx - 1;
    if (target !== -1) moveTile(target);
  }, [moveTile]);

  useGameMobileFix(isActive, gameRef, handleDirection);

  const scramble = (lvlKey = level) => {
    triggerGlitch();
    const sSize = LEVELS[lvlKey].size;
    let newGrid = Array.from({ length: sSize * sSize - 1 }, (_, i) => i + 1);
    newGrid.push(0);
    for (let i = 0; i < LEVELS[lvlKey].scramble; i++) {
      const eIdx = newGrid.indexOf(0);
      const rE = Math.floor(eIdx / sSize), cE = eIdx % sSize;
      const m = [];
      if (rE > 0)       m.push(eIdx - sSize);
      if (rE < sSize-1) m.push(eIdx + sSize);
      if (cE > 0)       m.push(eIdx - 1);
      if (cE < sSize-1) m.push(eIdx + 1);
      const mv = m[Math.floor(Math.random() * m.length)];
      [newGrid[eIdx], newGrid[mv]] = [newGrid[mv], newGrid[eIdx]];
    }
    if (lvlKey !== level) setLevel(lvlKey);
    setGrid(newGrid); setCracked(false); setMoves(0); setScore(0); setTime(0);
    setStartTime(null); setShowHint(false);
  };

  useEffect(() => {
    if (moves > 0 && grid.every((v, i) => v === SOLVED_GRID[i])) {
      setCracked(true); setScore(s => s + 2000);
    }
  }, [grid, moves, SOLVED_GRID]);

  const tileFs = size >= 5 ? 10 : size === 4 ? 13 : size === 3 ? 16 : 20;

  return (
    <motion.div
      ref={gameRef}
      tabIndex={-1}
      className={isActive ? 'mobile-fullscreen-active' : ''}
      onFocus={() => setIsActive(true)}
      onBlur={() => setIsActive(false)}
      animate={isGlitching ? { x: [0,-2,2,-1,1,0], opacity:[1,0.8,1] } : {}}
      style={{ ...simCard(isActive, cracked), cursor: 'default' }}
    >
      {isActive && <MobileDPad onDirection={handleDirection} />}
      {/* ── Header ── */}
      <div style={simHeader(ACCENT_RGB)}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {cracked
            ? <ShieldCheck size={13} color={SIM.green} />
            : <Activity    size={13} color={SIM.green} />}
          <span style={{ fontSize:9, fontWeight:900, color: cracked ? SIM.green : SIM.green, letterSpacing:1.5 }}>
            {cracked ? 'DECRYPTION_OK' : `BYPASS_X · ${LEVELS[level].label}`}
          </span>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <button onClick={() => setShowHint(!showHint)} className="sim-icon-btn" style={simIconBtn(showHint)} title="Hint"><HelpCircle size={13}/></button>
          <button onClick={() => setShowRules(true)}     className="sim-icon-btn" style={simIconBtn(false)}   title="Rules"><Info       size={13}/></button>
          <button onClick={() => scramble()}             className="sim-icon-btn" style={simIconBtn(false)}   title="Reset"><RefreshCw  size={13}/></button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height:2, background:'rgba(255,255,255,0.04)' }}>
        <motion.div
          animate={{ width:`${progress}%` }}
          style={{ height:'100%', background: cracked ? SIM.green : SIM.green, boxShadow:`0 0 8px ${SIM.green}` }}
        />
      </div>

      {/* ── Difficulty tabs ── */}
      <div style={{ display:'flex', background:'rgba(0,0,0,0.3)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
        {Object.entries(LEVELS).map(([key, lvl]) => (
          <button
            key={key}
            onClick={() => scramble(key)}
            style={{
              flex:1, padding:'8px 0', border:'none',
              borderRight:'1px solid rgba(255,255,255,0.04)',
              background: level === key ? `rgba(16,185,129,0.12)` : 'transparent',
              color:      level === key ? SIM.green : SIM.txMuted,
              fontSize:9, fontWeight:900, cursor:'pointer', position:'relative',
              fontFamily: SIM.font, letterSpacing:1, transition:'all 0.15s',
            }}
          >
            {key}
            {level === key && <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:SIM.green }}/>}
          </button>
        ))}
      </div>

      {/* ── Grid ── */}
      <div style={{ padding:14 }}>
        {/* Fixed square area so card height stays uniform regardless of grid size */}
        <div style={{ width:'100%', aspectRatio:'1/1', overflow:'hidden', marginBottom:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${size}, 1fr)`, gap:5, width:'100%', height:'100%' }}>
          {grid.map((num, i) => {
            const isHint = showHint && num === hintTile && !cracked;
            return (
              <motion.div
                key={`${level}-${num === 0 ? 'empty' : num}`}
                layout
                onClick={() => moveTile(i)}
                transition={{ type:'spring', stiffness:500, damping:35 }}
                style={{
                  aspectRatio:'1/1',
                  cursor:     num === 0 || cracked ? 'default' : 'pointer',
                  background: num === 0 ? 'transparent'
                    : cracked  ? `rgba(16,185,129,0.12)`
                    : isHint   ? `rgba(16,185,129,0.1)`
                    :            SIM.bgSurface,
                  border: `1px solid ${
                    num === 0   ? 'transparent'
                    : cracked   ? `rgba(16,185,129,0.5)`
                    : isHint    ? SIM.green
                    :             'rgba(16,185,129,0.18)'
                  }`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  borderRadius:3, fontSize:tileFs, fontWeight:800,
                  color: cracked ? SIM.green : isHint ? SIM.green : SIM.txSecondary,
                  boxShadow: isHint ? `0 0 12px rgba(16,185,129,0.2)` : 'none',
                  fontFamily: SIM.font,
                }}
                whileHover={(!cracked && num !== 0) ? { background:'rgba(16,185,129,0.1)', borderColor:SIM.green } : {}}
              >
              {num !== 0 && (cracked ? '✔' : num)}
              </motion.div>
            );
          })}
          </div> {/* inner grid */}
        </div> {/* square wrapper */}

        {/* ── Footer ── */}
        <div style={simFooter}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={simStatus(isActive)}>
              {isActive ? '▶ CONTROLS_ENGAGED' : '◼ SYSTEM_STANDBY'}
            </span>
            <div style={{ display:'flex', gap:12 }}>
              <span style={{ fontSize:9, color:SIM.txMuted, display:'flex', alignItems:'center', gap:3, fontFamily:SIM.font }}>
                <Clock size={9}/> {time}s
              </span>
              <span style={{ fontSize:9, color:SIM.txMuted, display:'flex', alignItems:'center', gap:3, fontFamily:SIM.font }}>
                <Keyboard size={9}/> {moves}
              </span>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, fontWeight:900, color: cracked ? SIM.green : SIM.green, fontFamily:SIM.font }}>
              {score.toString().padStart(6,'0')}
            </div>
            <div style={{ fontSize:8, color:SIM.txMuted, fontFamily:SIM.font, marginTop:2 }}>SCORE</div>
          </div>
        </div>
      </div>

      {/* ── Win scan-line overlay ── */}
      <AnimatePresence>
        {cracked && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
            style={{ position:'absolute', inset:0, pointerEvents:'none', background:'rgba(16,185,129,0.04)', zIndex:10 }}>
            <motion.div animate={{ y:['0%','100%'] }} transition={{ duration:1.5, repeat:Infinity, ease:'linear' }}
              style={{ height:'20%', background:'linear-gradient(transparent,rgba(16,185,129,0.15),transparent)', width:'100%' }}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rules overlay ── */}
      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{
              position:'absolute', inset:0, zIndex:60, background:SIM.bg,
              padding:20, display:'flex', flexDirection:'column',
              border:`1px solid ${SIM.green}`,
            }}
          >
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontSize:10, fontWeight:900, color:SIM.green, letterSpacing:1.5 }}>DECRYPTION_PROTOCOL</span>
              <button onClick={() => setShowRules(false)} className="sim-icon-btn" style={simIconBtn()}><X size={14}/></button>
            </div>
            <div style={{ flex:1, fontSize:11, color:SIM.txSecondary, lineHeight:1.8, fontFamily:SIM.font }}>
              {'> CLICK tile or use ARROW KEYS to shift'}<br/>
              {'> Arrange tiles in ascending order [1→N]'}<br/>
              {'> Use HINT for +15x score bonus'}<br/>
              {'> Fastest time = highest rank'}
            </div>
            <div style={{ background:`rgba(16,185,129,0.08)`, padding:'10px 14px', borderLeft:`3px solid ${SIM.green}`, fontSize:10, color:SIM.green, marginBottom:14 }}>
              OPERATOR CREDENTIALS RECOGNIZED
            </div>
            <button
              onClick={() => { scramble(); setShowRules(false); }}
              style={{ width:'100%', padding:'12px 0', background:SIM.green, color:'#000', border:'none', fontSize:11, fontWeight:900, cursor:'pointer', letterSpacing:1, fontFamily:SIM.font, borderRadius:3 }}
            >
              INITIALIZE SEQUENCE
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {showHint && !cracked && hintTile && (
        <div style={{ position:'absolute', top:8, right:52, background:`rgba(16,185,129,0.15)`, border:`1px solid ${SIM.green}`, padding:'3px 8px', borderRadius:3, display:'flex', alignItems:'center', gap:4 }}>
          <Zap size={9} color={SIM.green} fill={SIM.green}/>
          <span style={{ fontSize:8, color:SIM.green, fontWeight:900, fontFamily:SIM.font }}>TILE {hintTile}</span>
        </div>
      )}
    </motion.div>
  );
}
