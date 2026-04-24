import { motion } from 'framer-motion';
import { Gamepad2, ShieldCheck, Database, LayoutGrid } from 'lucide-react';
import MovingPuzzle from '../components/MovingPuzzle';
import Game2048    from '../components/Game2048';
import XOGame      from '../components/XOGame';
import { SIM }     from '../components/simUI';

const MODULES = [
  {
    key:   'decrypt',
    code:  'MODULE_01',
    name:  'BYPASS_X',
    icon:  ShieldCheck,
    color: SIM.green,
    rgb:   '16,185,129',
    desc:  'Realign encrypted data nodes to establish a secure bypass. Precision over speed.',
    game:  MovingPuzzle,
  },
  {
    key:   'fusion',
    code:  'MODULE_02',
    name:  'DATA_FUSION',
    icon:  Database,
    color: SIM.purple,
    rgb:   '139,92,246',
    desc:  'Merge identical data blocks to compress the matrix. Reach 2048 to stabilize the core.',
    game:  Game2048,
  },
  {
    key:   'grid',
    code:  'MODULE_03',
    name:  'TACTICAL_GRID',
    icon:  LayoutGrid,
    color: SIM.orange,
    rgb:   '249,115,22',
    desc:  'Outwit the adversarial AI on a 3×3 strategic grid. Challenge a partner or face Minimax.',
    game:  XOGame,
  },
];

export default function SimulationsPage() {
  return (
    <motion.div
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      exit={{ opacity:0, y:-16 }}
      className="page-container"
      style={{ padding:'24px', display:'flex', flexDirection:'column', gap:'32px' }}
    >
      <style>{`
        /* Responsive 3→2→1 column grid */
        .sim-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          width: 100%;
          align-items: start;   /* each column natural height */
        }
        @media (max-width: 1100px) {
          .sim-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .sim-grid { grid-template-columns: 1fr; }
        }

        /* Module column: label + desc + card stack */
        .sim-module {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* Game card shell — consistent padding and look */
        .sim-card-shell {
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.05);
          background: rgba(0,0,0,0.18);
          padding: 14px;
        }
      `}</style>

      {/* ── Page Header ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:16,
        borderBottom:'1px solid rgba(255,255,255,0.05)', paddingBottom:24,
        flexWrap:'wrap', rowGap:12,
      }}>
        <div style={{
          padding:12, background:'rgba(139,92,246,0.08)',
          borderRadius:8, border:'1px solid rgba(139,92,246,0.2)', flexShrink:0,
        }}>
          <Gamepad2 size={26} color={SIM.purple}/>
        </div>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:900, letterSpacing:-0.5, color:'var(--text-primary)' }}>
            TRAINING SIMULATIONS
          </h1>
          <p style={{
            margin:'4px 0 0 0', fontSize:11, color:'var(--text-muted)',
            fontFamily:SIM.font, textTransform:'uppercase', letterSpacing:1.2,
          }}>
            Operator Cognitive Testing Facility · 3 Modules Active
          </p>
        </div>

        {/* Status pills */}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap' }}>
          {MODULES.map(m => (
            <div key={m.key} style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'5px 10px',
              background:`rgba(${m.rgb},0.08)`,
              border:`1px solid rgba(${m.rgb},0.25)`,
              borderRadius:3,
            }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:m.color, boxShadow:`0 0 5px ${m.color}` }}/>
              <span style={{ fontSize:9, fontWeight:700, color:m.color, fontFamily:SIM.font, letterSpacing:1 }}>
                {m.code}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Module Grid ── */}
      <div className="sim-grid">
        {MODULES.map((m, i) => {
          const GameComp = m.game;
          return (
            <motion.div
              key={m.key}
              className="sim-module"
              initial={{ opacity:0, y:20 }}
              animate={{ opacity:1, y:0 }}
              transition={{ delay: i * 0.07 }}
            >
              {/* Module label row */}
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <m.icon size={14} color={m.color}/>
                <div>
                  <div style={{
                    fontSize:9, fontWeight:900, color:m.color,
                    fontFamily:SIM.font, letterSpacing:1.5, textTransform:'uppercase',
                  }}>
                    {m.code}: {m.name}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p style={{
                margin:0, fontSize:12, color:'var(--text-muted)',
                lineHeight:1.65,
              }}>
                {m.desc}
              </p>

              {/* Game card */}
              <div className="sim-card-shell">
                <GameComp
                  {...(m.key === 'grid' ? {
                    onWin:  (w) => console.log(`[TACTICAL] winner: ${w}`),
                    onDraw: ()  => console.log('[TACTICAL] draw'),
                  } : {})}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
