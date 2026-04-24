// Simulation Design System — shared tokens for all 3 game modules
// Import this in MovingPuzzle, Game2048, and XOGame

export const SIM = {
  // Surfaces
  bg:          'rgba(8, 12, 22, 0.98)',
  bgSurface:   'rgba(255,255,255,0.03)',
  bgHover:     'rgba(139,92,246,0.08)',

  // Accent palette
  purple:      '#8b5cf6',
  green:       '#10b981',
  orange:      '#f97316',
  red:         '#ef4444',

  // Border states
  bdIdle:      'rgba(139,92,246,0.22)',
  bdActive:    '#8b5cf6',
  bdWin:       '#10b981',

  // Text
  txPrimary:   'rgba(255,255,255,0.90)',
  txSecondary: 'rgba(255,255,255,0.50)',
  txMuted:     'rgba(255,255,255,0.25)',

  // Shadows
  shIdle:      '0 4px 24px rgba(0,0,0,0.5)',
  shActive:    '0 0 0 1px rgba(139,92,246,0.25), 0 0 24px rgba(139,92,246,0.15)',
  shWin:       '0 0 24px rgba(16,185,129,0.15)',

  // Font
  font:        "var(--mono, 'JetBrains Mono', 'Fira Code', monospace)",
};

/** Returns the shared card wrapper style */
export function simCard(isActive, isWin) {
  return {
    background:     SIM.bg,
    backdropFilter: 'blur(20px)',
    border:         `1px solid ${isActive ? SIM.bdActive : isWin ? SIM.bdWin : SIM.bdIdle}`,
    boxShadow:       isActive ? SIM.shActive : isWin ? SIM.shWin : SIM.shIdle,
    borderRadius:   4,
    overflow:       'hidden',
    fontFamily:     SIM.font,
    transition:     'border-color 0.2s ease, box-shadow 0.2s ease',
    outline:        'none',
    width:          '100%',
    position:       'relative',
  };
}

/** Header bar for each game module */
export function simHeader(accentRgb) {
  return {
    background:   `rgba(${accentRgb}, 0.12)`,
    borderBottom: `1px solid rgba(${accentRgb}, 0.25)`,
    padding:      '10px 14px',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
  };
}

/** Footer bar */
export const simFooter = {
  borderTop:      '1px solid rgba(255,255,255,0.05)',
  padding:        '10px 14px',
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
};

/** Icon button */
export function simIconBtn(active = false) {
  return {
    background:  'none',
    border:      'none',
    padding:     3,
    cursor:      'pointer',
    color:       active ? SIM.purple : SIM.txMuted,
    display:     'flex',
    alignItems:  'center',
    lineHeight:  1,
    transition:  'color 0.15s',
  };
}

/** Status badge text style */
export function simStatus(isActive) {
  return {
    fontSize:      9,
    fontWeight:    700,
    letterSpacing: 1.2,
    color:         isActive ? SIM.purple : SIM.txMuted,
    transition:    'color 0.2s',
    textTransform: 'uppercase',
  };
}
