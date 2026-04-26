// <XOGame onWin={(w) => console.log(w + ' won!')} onDraw={() => console.log('draw')} />

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, RotateCcw, Cpu, Users } from 'lucide-react';
import { SIM, simCard, simHeader, simFooter, simIconBtn, simStatus, useGameMobileFix } from './simUI';

const ACCENT_RGB = '249,115,22'; // orange
const WIN_LINES  = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function checkWinner(board) {
  for (const [a,b,c] of WIN_LINES) {
    if (board[a] && board[a]===board[b] && board[a]===board[c]) return { winner:board[a], line:[a,b,c] };
  }
  return null;
}

function isFull(board) { return board.every(c => c!==null); }

function minimax(board, depth, isMax) {
  const r = checkWinner(board);
  if (r) return r.winner==='O' ? 10-depth : depth-10;
  if (isFull(board)) return 0;
  if (isMax) {
    let best=-Infinity;
    for(let i=0;i<9;i++) { if(!board[i]) { board[i]='O'; best=Math.max(best,minimax(board,depth+1,false)); board[i]=null; } }
    return best;
  } else {
    let best=Infinity;
    for(let i=0;i<9;i++) { if(!board[i]) { board[i]='X'; best=Math.min(best,minimax(board,depth+1,true)); board[i]=null; } }
    return best;
  }
}

function getBestMove(board) {
  let bestScore=-Infinity, bestMove=-1;
  for(let i=0;i<9;i++) {
    if(!board[i]) { board[i]='O'; const s=minimax(board,0,false); board[i]=null; if(s>bestScore){bestScore=s;bestMove=i;} }
  }
  return bestMove===-1 ? board.findIndex(c=>c===null) : bestMove;
}

const emptyBoard = () => Array(9).fill(null);

// Inject XO-specific CSS once
let _xoStylesInjected = false;
function injectXOStyles() {
  if (_xoStylesInjected) return;
  _xoStylesInjected = true;
  const el = document.createElement('style');
  el.textContent = `
    .xo-cell {
      aspect-ratio: 1/1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(249,115,22,0.18);
      border-radius: 3px;
      cursor: pointer;
      background: rgba(255,255,255,0.03);
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
      position: relative;
      overflow: hidden;
      user-select: none;
    }
    .xo-cell:hover:not(.xo-disabled) {
      background: rgba(249,115,22,0.07);
      border-color: rgba(249,115,22,0.4);
    }
    .xo-cell.xo-disabled { cursor: default; }
    .xo-cell.xo-win-x {
      background: rgba(139,92,246,0.14);
      border-color: rgba(139,92,246,0.55);
      box-shadow: 0 0 10px rgba(139,92,246,0.15);
    }
    .xo-cell.xo-win-o {
      background: rgba(249,115,22,0.14);
      border-color: rgba(249,115,22,0.55);
      box-shadow: 0 0 10px rgba(249,115,22,0.15);
    }
    .xo-cell-pop {
      animation: xo-pop 160ms ease forwards;
    }
    @keyframes xo-pop {
      from { opacity:0; transform:scale(0.5); }
      to   { opacity:1; transform:scale(1); }
    }
  `;
  document.head.appendChild(el);
}

export default function XOGame({ onWin, onDraw }) {
  const [mode, setMode]           = useState(null); // null|'2p'|'ai'
  const [board, setBoard]         = useState(emptyBoard());
  const [xIsNext, setXIsNext]     = useState(true);
  const [winResult, setWinResult] = useState(null);
  const [isDraw, setIsDraw]       = useState(false);
  const [scores, setScores]       = useState({ X:0, O:0, D:0 });
  const [thinking, setThinking]   = useState(false);
  const [animCells, setAnimCells] = useState(new Set());
  const [isActive, setIsActive]   = useState(false);
  const gameRef                   = useRef(null);

  useGameMobileFix(isActive, gameRef);

  useEffect(() => { injectXOStyles(); }, []);

  const gameOver = !!winResult || isDraw;

  const statusText = () => {
    if (winResult) return `${winResult.winner} WINS`;
    if (isDraw)    return 'DRAW DETECTED';
    if (thinking)  return 'AI_COMPUTING...';
    return xIsNext ? "X_TURN" : "O_TURN";
  };

  const statusColor = () => {
    if (winResult?.winner==='X') return SIM.purple;
    if (winResult?.winner==='O') return SIM.orange;
    if (isDraw) return SIM.txSecondary;
    return thinking ? SIM.orange : (xIsNext ? SIM.purple : SIM.orange);
  };

  const applyMove = useCallback((idx, currentBoard, currentXIsNext) => {
    const nb = [...currentBoard];
    nb[idx] = currentXIsNext ? 'X' : 'O';

    setAnimCells(prev => new Set(prev).add(idx));
    setTimeout(() => setAnimCells(prev => { const s=new Set(prev); s.delete(idx); return s; }), 250);

    const result = checkWinner(nb);
    if (result) {
      setWinResult(result);
      setScores(prev => ({ ...prev, [result.winner]: prev[result.winner]+1 }));
      if (onWin) onWin(result.winner);
      setBoard(nb); return { newBoard:nb, over:true };
    }
    if (isFull(nb)) {
      setIsDraw(true);
      setScores(prev => ({ ...prev, D:prev.D+1 }));
      if (onDraw) onDraw();
      setBoard(nb); return { newBoard:nb, over:true };
    }
    setBoard(nb); setXIsNext(!currentXIsNext);
    return { newBoard:nb, over:false };
  }, [onWin, onDraw]);

  const handleCellClick = useCallback((idx) => {
    if (board[idx] || gameOver || thinking) return;
    const { newBoard, over } = applyMove(idx, board, xIsNext);
    if (!over && mode==='ai') {
      setThinking(true);
      const snap = [...newBoard];
      setTimeout(() => {
        const aiMove = getBestMove([...snap]);
        if (aiMove!==-1) applyMove(aiMove, snap, false);
        setThinking(false);
      }, 320);
    }
  }, [board, gameOver, thinking, mode, xIsNext, applyMove]);

  const newGame = () => {
    setBoard(emptyBoard()); setXIsNext(true); setWinResult(null);
    setIsDraw(false); setThinking(false); setAnimCells(new Set());
  };
  const resetScores = () => { setScores({X:0,O:0,D:0}); newGame(); };
  const changeMode  = () => { setMode(null); newGame(); };
  const selectMode  = (m) => { setMode(m);   newGame(); };

  // ── Mode Picker ──────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <div 
        ref={gameRef}
        tabIndex={-1}
        onFocus={() => setIsActive(true)}
        onBlur={() => setIsActive(false)}
        className={isActive ? 'mobile-fullscreen-active' : ''}
        style={{ ...simCard(isActive, false), cursor:'default' }}
      >
        <div style={simHeader(ACCENT_RGB)}>
          <span style={{ fontSize:9, fontWeight:900, color:SIM.orange, letterSpacing:1.5 }}>TACTICAL_GRID · SELECT_MODE</span>
        </div>
        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:9, color:SIM.txMuted, fontFamily:SIM.font, letterSpacing:1, marginBottom:4 }}>
            CHOOSE ENGAGEMENT PROTOCOL
          </div>
          <button
            onClick={() => selectMode('2p')}
            style={{
              width:'100%', padding:'14px', background:'rgba(249,115,22,0.08)',
              border:`1px solid rgba(249,115,22,0.3)`, borderRadius:3, cursor:'pointer',
              display:'flex', alignItems:'center', gap:10, fontFamily:SIM.font, transition:'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(249,115,22,0.15)'; e.currentTarget.style.borderColor=SIM.orange; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(249,115,22,0.08)'; e.currentTarget.style.borderColor='rgba(249,115,22,0.3)'; }}
          >
            <Users size={16} color={SIM.orange}/>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:11, fontWeight:900, color:SIM.txPrimary, letterSpacing:0.5 }}>2 PLAYERS</div>
              <div style={{ fontSize:9, color:SIM.txMuted, marginTop:2 }}>Local multiplayer mode</div>
            </div>
          </button>
          <button
            onClick={() => selectMode('ai')}
            style={{
              width:'100%', padding:'14px', background:'rgba(139,92,246,0.08)',
              border:`1px solid rgba(139,92,246,0.3)`, borderRadius:3, cursor:'pointer',
              display:'flex', alignItems:'center', gap:10, fontFamily:SIM.font, transition:'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(139,92,246,0.15)'; e.currentTarget.style.borderColor=SIM.purple; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(139,92,246,0.08)'; e.currentTarget.style.borderColor='rgba(139,92,246,0.3)'; }}
          >
            <Cpu size={16} color={SIM.purple}/>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:11, fontWeight:900, color:SIM.txPrimary, letterSpacing:0.5 }}>VS COMPUTER</div>
              <div style={{ fontSize:9, color:SIM.txMuted, marginTop:2 }}>Unbeatable Minimax AI</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Game View ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={gameRef}
      tabIndex={-1}
      className={isActive ? 'mobile-fullscreen-active' : ''}
      onFocus={() => setIsActive(true)}
      onBlur={() => setIsActive(false)}
      style={{ ...simCard(isActive, false), cursor:'default' }}
    >
      {/* Header */}
      <div style={simHeader(ACCENT_RGB)}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {mode==='ai' ? <Cpu size={13} color={SIM.orange}/> : <Users size={13} color={SIM.orange}/>}
          <span style={{ fontSize:9, fontWeight:900, color:SIM.orange, letterSpacing:1.5 }}>
            TACTICAL_GRID · {mode==='ai' ? 'VS_AI' : '2P_MODE'}
          </span>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <button onClick={newGame}     className="sim-icon-btn" style={simIconBtn(false)} title="New game"><RefreshCw  size={13}/></button>
          <button onClick={changeMode}  className="sim-icon-btn" style={simIconBtn(false)} title="Change mode"><RotateCcw size={13}/></button>
        </div>
      </div>

      {/* Score strip */}
      <div style={{ display:'flex', background:'rgba(0,0,0,0.25)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
        {[['X', scores.X, SIM.purple], ['DRAW', scores.D, SIM.txMuted], ['O', scores.O, SIM.orange]].map(([lbl,val,col]) => (
          <div key={lbl} style={{ flex:1, padding:'7px 0', textAlign:'center', borderRight:lbl!=='O'?'1px solid rgba(255,255,255,0.05)':'none' }}>
            <div style={{ fontSize:8, color:SIM.txMuted, fontFamily:SIM.font, letterSpacing:1 }}>{lbl}</div>
            <div style={{ fontSize:18, fontWeight:900, color:col, fontFamily:SIM.font, lineHeight:1.2 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:10, fontWeight:900, color:statusColor(), fontFamily:SIM.font, letterSpacing:1, transition:'color 0.2s' }}>
          {statusText()}
        </span>
        {thinking && (
          <span style={{ fontSize:8, color:SIM.orange, fontFamily:SIM.font }}>
            {'█'.repeat(Math.floor(Date.now()/300)%4+1)}
          </span>
        )}
      </div>

      {/* Board */}
      <div style={{ padding:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
          {board.map((cell, idx) => {
            const isWin = winResult?.line?.includes(idx);
            let cls = 'xo-cell';
            if (gameOver || thinking) cls += ' xo-disabled';
            if (isWin && winResult?.winner==='X') cls += ' xo-win-x';
            if (isWin && winResult?.winner==='O') cls += ' xo-win-o';
            if (animCells.has(idx)) cls += ' xo-cell-pop';
            return (
              <div key={idx} className={cls} onClick={() => handleCellClick(idx)}>
                {cell && (
                  <span style={{
                    fontSize:    'clamp(24px, 5vw, 40px)',
                    fontWeight:  900,
                    color:       cell==='X' ? SIM.purple : SIM.orange,
                    fontFamily:  SIM.font,
                    lineHeight:  1,
                    textShadow:  cell==='X'
                      ? '0 0 12px rgba(139,92,246,0.5)'
                      : '0 0 12px rgba(249,115,22,0.5)',
                  }}>
                    {cell}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={simFooter}>
        <span style={simStatus(isActive)}>
          {isActive ? '▶ CONTROLS_ENGAGED' : '◼ SYSTEM_STANDBY'}
        </span>
        <button
          onClick={resetScores}
          className="sim-icon-btn"
          style={{ ...simIconBtn(false), fontSize:8, fontFamily:SIM.font, gap:4, letterSpacing:0.5 }}
        >
          RESET SCORES
        </button>
      </div>
    </div>
  );
}
