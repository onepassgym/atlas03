import { useApp } from '../context/AppContext';
import { getBaseUrl } from '../api/client';
import { Sun, Moon } from 'lucide-react';
import styles from './Header.module.css';

export default function Header() {
  const { env, switchEnv, connected, isProdHost, theme, toggleTheme } = useApp();

  return (
    <header className={styles.header} id="app-header">
      <div className={styles.headerLeft}>
        <div className={styles.logoContainer}>
          <img src="./full-logo.svg" alt="Atlas Logo" className={styles.desktopLogo} />
          <img src="./favicon.svg" alt="Atlas Logo" className={styles.mobileLogo} />
        </div>
        {!isProdHost && (
          <div className={styles.envToggle}>
            <button className={`${styles.envBtn} ${env === 'local' ? styles.active : ''}`} onClick={() => switchEnv('local')}>Local</button>
            <button className={`${styles.envBtn} ${env === 'prod' ? styles.active : ''}`} onClick={() => switchEnv('prod')}>Production</button>
          </div>
        )}
      </div>
      <div className={styles.headerRight}>
        <div className={styles.envStatus}>
          <span style={{ opacity: 0.5 }}>API:</span>
          <span>{(getBaseUrl() || window.location.origin).replace(/https?:\/\//, '')}</span>
        </div>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          <div className="theme-toggle-knob">
            {theme === 'dark' ? <Moon size={10} /> : <Sun size={10} />}
          </div>
        </button>
        <div className={styles.connectionBadge}>
          <span className={`${styles.connectionDot} ${connected ? styles.connected : ''}`} />
          <span>{connected ? 'Live' : 'Reconnecting…'}</span>
        </div>
      </div>
    </header>
  );
}
