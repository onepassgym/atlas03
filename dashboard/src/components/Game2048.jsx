import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ShieldCheck, Activity, Undo2 } from 'lucide-react';
import { SIM, simCard, simHeader, simFooter, simIconBtn, simStatus } from './simUI';

const ACCENT_RGB = '139,92,246'; // purple

const TILE_COLORS = {
  2:    ['rgba(139,92,246,0.10)', SIM.purple],
  4:    ['rgba(139,92,246,0.18)', SIM.purple],
  8:    ['rgba(139,92,246,0.27)', '#c4b5fd'],
  16:   ['rgba(139,92,246,0.36)', '#c4b5fd'],
  32:   ['rgba(139,92,246,0.45)', '#e9d5ff'],
  64:   ['rgba(139,92,246,0.56)', '#ffffff'],
  128:  ['rgba(139,92,246,0.67)', '#ffffff'],
  256:  ['rgba(16,185,129,0.30)', SIM.green],
  512:  ['rgba(16,185,129,0.50)', '#6ee7b7'],
  1024: ['rgba(16,185,129,0.70)', '#ffffff'],
  2048: [SIM.green,               '#000000'],
};
const tileColor  = (v) => (TILE_COLORS[v] || ['rgba(255,255,255,0.06)', SIM.txSecondary])[0];
const tileFg     = (v) => (TILE_COLORS[v] || ['rgba(255,255,255,0.06)', SIM.txSecondary])[1];
const tileFs     = (v) => v >= 1000 ? 11 : v >= 100 ? 13 : 15;
const tileBorder = (v) => v >= 256 ? `rgba(16,185,129,0.4)` : 'rgba(139,92,246,0.22)';

export default function Game2048() {
  const [board, setBoard]           = useState(Array(4).fill().map(() => Array(4).fill(0)));
  const [score, setScore]           = useState(0);
  const [best, setBest]             = useState(parseInt(localStorage.getItem('atlas-2048-best')) || 0);
  const [gameOver, setGameOver]     = useState(false);
  const [win, setWin]               = useState(false);
  const [isActive, setIsActive]     = useState(false);
  const [activeTiles, setActiveTiles] = useState([]);

  const tileIdCounter = useRef(0);
  const stateRef      = useRef({ board, score, best, gameOver, win, isActive, activeTiles });
  const historyRef    = useRef(null);

  useEffect(() => {
    stateRef.current = { board, score, best, gameOver, win, isActive, activeTiles };
  }, [board, score, best, gameOver, win, isActive, activeTiles]);

  const initGame = useCallback(() => {
    tileIdCounter.current = 0;
    const initialBoard = Array(4).fill().map(() => Array(4).fill(0));
    const newTiles = [];
    for (let i = 0; i < 2; i++) {
      const empty = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (initialBoard[r][c] === 0) empty.push({r,c});
      if (empty.length > 0) {
        const {r,c} = empty[Math.floor(Math.random() * empty.length)];
        const val = Math.random() < 0.9 ? 2 : 4;
        initialBoard[r][c] = val;
        tileIdCounter.current += 1;
        newTiles.push({ id:tileIdCounter.current, r, c, val, isNew:true });
      }
    }
    setBoard(initialBoard); setActiveTiles(newTiles);
    setScore(0); setGameOver(false); setWin(false); historyRef.current = null;
  }, []);

  useEffect(() => { initGame(); }, [initGame]);

  const updateScore = (pts) => {
    const ns = stateRef.current.score + pts;
    setScore(ns);
    if (ns > stateRef.current.best) { setBest(ns); localStorage.setItem('atlas-2048-best', ns); }
  };

  const undo = () => {
    if (!historyRef.current) return;
    const { prevBoard, prevScore, prevTiles } = historyRef.current;
    setBoard(prevBoard.map(r => [...r])); setScore(prevScore);
    setActiveTiles(prevTiles.map(t => ({...t})));
    setWin(false); setGameOver(false); historyRef.current = null;
  };

  const slideLeft = (row) => {
    let filtered = row.filter(v => v !== 0);
    let newRow = [], deadTiles = [], scoreGain = 0;
    for (let i = 0; i < filtered.length - 1; i++) {
      if (filtered[i].val === filtered[i+1].val) {
        filtered[i].val *= 2; scoreGain += filtered[i].val;
        filtered[i+1].delete = true; filtered[i+1].mergedInto = filtered[i].id;
        if (filtered[i].val === 2048) setWin(true);
      }
    }
    filtered.forEach(v => v.delete ? deadTiles.push(v) : newRow.push(v));
    while (newRow.length < 4) newRow.push(0);
    return { newRow, deadTiles, scoreGain };
  };

  const transpose    = (m) => { const r=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; for(let i=0;i<4;i++) for(let j=0;j<4;j++) r[i][j]=m[j][i]; return r; };
  const reverseRows  = (m) => m.map(r => [...r].reverse());

  const move = useCallback((direction) => {
    const { board:cb, activeTiles:ct, score:cs, gameOver:isOver } = stateRef.current;
    if (isOver) return;
    let moved=false, allDead=[], totalGain=0;
    historyRef.current = { prevBoard:cb.map(r=>[...r]), prevScore:cs, prevTiles:ct.map(t=>({...t})) };

    let obj = cb.map((row,r) => row.map((val,c) => {
      if (val===0) return 0;
      return ct.find(t => t.r===r && t.c===c && !t.delete);
    }));

    if (direction==='left') {
      for (let r=0;r<4;r++) { const {newRow,deadTiles,scoreGain}=slideLeft(obj[r]); if(cb[r].join()!==newRow.map(v=>v?v.val:0).join()) moved=true; obj[r]=newRow; allDead.push(...deadTiles); totalGain+=scoreGain; }
    } else if (direction==='right') {
      obj=reverseRows(obj);
      for (let r=0;r<4;r++) { const {newRow,deadTiles,scoreGain}=slideLeft(obj[r]); if(cb[r].reverse().join()!==newRow.map(v=>v?v.val:0).join()) moved=true; cb[r].reverse(); obj[r]=newRow; allDead.push(...deadTiles); totalGain+=scoreGain; }
      obj=reverseRows(obj);
    } else if (direction==='up') {
      obj=transpose(obj); const tb=transpose(cb);
      for (let r=0;r<4;r++) { const {newRow,deadTiles,scoreGain}=slideLeft(obj[r]); if(tb[r].join()!==newRow.map(v=>v?v.val:0).join()) moved=true; obj[r]=newRow; allDead.push(...deadTiles); totalGain+=scoreGain; }
      obj=transpose(obj);
    } else if (direction==='down') {
      obj=reverseRows(transpose(obj)); const tb=reverseRows(transpose(cb));
      for (let r=0;r<4;r++) { const {newRow,deadTiles,scoreGain}=slideLeft(obj[r]); if(tb[r].join()!==newRow.map(v=>v?v.val:0).join()) moved=true; obj[r]=newRow; allDead.push(...deadTiles); totalGain+=scoreGain; }
      obj=transpose(reverseRows(obj));
    }

    if (moved) {
      if (totalGain>0) updateScore(totalGain);
      const nb = obj.map(r=>r.map(v=>v?v.val:0));
      setBoard(nb);
      let nt=[];
      for(let r=0;r<4;r++) for(let c=0;c<4;c++) { if(obj[r][c]!==0) { obj[r][c].r=r; obj[r][c].c=c; obj[r][c].isNew=false; nt.push(obj[r][c]); } }
      allDead.forEach(dt => { const sv=nt.find(t=>t.id===dt.mergedInto); if(sv){ dt.r=sv.r; dt.c=sv.c; nt.push(dt); } });
      const empty=[];
      for(let r=0;r<4;r++) for(let c=0;c<4;c++) if(nb[r][c]===0) empty.push({r,c});
      if(empty.length>0) {
        const {r,c}=empty[Math.floor(Math.random()*empty.length)];
        const val=Math.random()<0.9?2:4; nb[r][c]=val; tileIdCounter.current+=1;
        nt.push({ id:tileIdCounter.current, r, c, val, isNew:true });
        setBoard([...nb]);
      }
      setActiveTiles(nt);
      setTimeout(() => setActiveTiles(cur => cur.filter(t=>!t.delete)), 150);
      let full=true, hasMv=false;
      for(let r=0;r<4;r++) for(let c=0;c<4;c++) {
        if(nb[r][c]===0) full=false;
        if(c<3 && nb[r][c]===nb[r][c+1]) hasMv=true;
        if(r<3 && nb[r][c]===nb[r+1][c]) hasMv=true;
      }
      if(full && !hasMv) setGameOver(true);
    } else { historyRef.current=null; }
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      const { isActive:act } = stateRef.current;
      if (!act) return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
      if(e.key==='ArrowLeft')  move('left');
      if(e.key==='ArrowRight') move('right');
      if(e.key==='ArrowUp')    move('up');
      if(e.key==='ArrowDown')  move('down');
      if(e.key==='z' && (e.ctrlKey||e.metaKey)) undo();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [move]);

  const touchStart = useRef({x:0,y:0});
  const handleTouchStart = (e) => { touchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY}; };
  const handleTouchEnd   = (e) => {
    if (!stateRef.current.isActive || stateRef.current.gameOver) return;
    const dx=e.changedTouches[0].clientX-touchStart.current.x;
    const dy=e.changedTouches[0].clientY-touchStart.current.y;
    if (Math.abs(dx)>Math.abs(dy)) { if(Math.abs(dx)>30) move(dx>0?'right':'left'); }
    else { if(Math.abs(dy)>30) move(dy>0?'down':'up'); }
  };

  const GAP = 5;

  return (
    <div
      tabIndex={0}
      onFocus={() => setIsActive(true)}
      onBlur={() => setIsActive(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ ...simCard(isActive, win), cursor:'default' }}
    >
      {/* ── Header ── */}
      <div style={simHeader(ACCENT_RGB)}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {win ? <ShieldCheck size={13} color={SIM.green}/> : <Activity size={13} color={SIM.purple}/>}
          <span style={{ fontSize:9, fontWeight:900, color: win ? SIM.green : SIM.purple, letterSpacing:1.5 }}>
            {win ? 'FUSION_COMPLETE' : 'DATA_FUSION_V2'}
          </span>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {historyRef.current && (
            <button onClick={undo} style={simIconBtn(false)} title="Undo (Ctrl+Z)"><Undo2 size={13}/></button>
          )}
          <button onClick={initGame} style={simIconBtn(false)} title="New game"><RefreshCw size={13}/></button>
        </div>
      </div>

      {/* ── Score strip ── */}
      <div style={{ display:'flex', background:'rgba(0,0,0,0.25)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ flex:1, padding:'8px 14px', textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize:9, color:SIM.txMuted, fontFamily:SIM.font, letterSpacing:1 }}>SCORE</div>
          <div style={{ fontSize:16, fontWeight:900, color:SIM.purple, fontFamily:SIM.font }}>{score}</div>
        </div>
        <div style={{ flex:1, padding:'8px 14px', textAlign:'center' }}>
          <div style={{ fontSize:9, color:SIM.txMuted, fontFamily:SIM.font, letterSpacing:1 }}>BEST</div>
          <div style={{ fontSize:16, fontWeight:900, color:SIM.txSecondary, fontFamily:SIM.font }}>{best}</div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{ padding:14 }}>
        <div style={{ position:'relative', width:'100%', aspectRatio:'1/1', overflow:'hidden' }}>
          {/* Background cells */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gridTemplateRows:'repeat(4,1fr)', gap:GAP, position:'absolute', inset:0 }}>
            {Array(16).fill(0).map((_,i) => (
              <div key={`bg-${i}`} style={{ background:SIM.bgSurface, border:'1px solid rgba(255,255,255,0.04)', borderRadius:3 }}/>
            ))}
          </div>

          {/* Sliding tiles */}
          {activeTiles.map(t => (
            <div
              key={t.id}
              style={{
                position:'absolute',
                // Correct formula: cell_i starts at i*(cellSize+gap)=i*(25%-3.75px+5px)=i*(25%+1.25px)
                top:    `calc(${t.r*25}% + ${t.r*1.25}px)`,
                left:   `calc(${t.c*25}% + ${t.c*1.25}px)`,
                width:  'calc(25% - 3.75px)',
                height: 'calc(25% - 3.75px)',
                background:    tileColor(t.val),
                border:       `1px solid ${tileBorder(t.val)}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:      tileFs(t.val), fontWeight:900,
                color:         tileFg(t.val),
                boxShadow:     t.val>=256 ? `0 0 12px rgba(16,185,129,0.25)` : 'none',
                borderRadius:  3, fontFamily: SIM.font,
                transition:    'all 0.15s ease-in-out',
                zIndex:        t.delete ? 1 : 10,
                transform:     t.isNew ? 'scale(0.1)' : 'scale(1)',
                opacity:       t.isNew ? 0 : 1,
              }}
              ref={(el) => {
                if (el && t.isNew) requestAnimationFrame(() => { el.style.transform='scale(1)'; el.style.opacity='1'; });
              }}
            >
              {t.val}
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={simFooter}>
        <span style={simStatus(isActive)}>
          {isActive ? '▶ CONTROLS_ENGAGED' : '◼ SYSTEM_STANDBY'}
        </span>
        <span style={{ fontSize:9, color:SIM.txMuted, fontFamily:SIM.font, letterSpacing:0.5 }}>
          ↑↓←→ ARROW KEYS
        </span>
      </div>

      {/* ── Game Over ── */}
      {gameOver && (
        <div style={{ position:'absolute', inset:0, background:'rgba(8,12,22,0.93)', zIndex:30, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:24 }}>
          <span style={{ fontSize:11, fontWeight:900, color:SIM.red, letterSpacing:2, fontFamily:SIM.font }}>SYSTEM_HALTED</span>
          <button onClick={initGame} style={{ padding:'10px 32px', background:SIM.red, color:'#fff', border:'none', fontSize:11, fontWeight:900, cursor:'pointer', fontFamily:SIM.font, borderRadius:3, letterSpacing:1 }}>
            REBOOT
          </button>
        </div>
      )}
    </div>
  );
}
