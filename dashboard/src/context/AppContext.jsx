import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { setEnv, setApiKey, getApiKey, getBaseUrl, api, getEnv } from '../api/client';
import { useSSE } from '../hooks/useSSE';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}

export function AppProvider({ children }) {
  const isProdHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  const storedEnv = isProdHost ? 'prod' : (localStorage.getItem('atlas_env') || 'local');

  const [env, setEnvState] = useState(storedEnv);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [chainsCache, setChainsCache] = useState([]);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // ── Theme ──────────────────────────────────────────────────
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('atlas_theme');
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('atlas_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // Init API env
  useEffect(() => {
    const prodUrl = isProdHost ? window.location.origin : 'https://atlas.onepassgym.com';
    setEnv(env, prodUrl);

    const keyName = `atlas_api_key_${env}`;
    let key = sessionStorage.getItem(keyName);
    if (!key) {
      key = prompt(`Enter Atlas05 API Key for [${env.toUpperCase()}]:`);
      if (key) sessionStorage.setItem(keyName, key);
    }
    if (key) setApiKey(key);
  }, [env]);

  // Toast system
  const toast = useCallback((msg, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // Events
  const handleEvent = useCallback((event) => {
    setEvents(prev => {
      const next = [event, ...prev];
      return next.length > 100 ? next.slice(0, 100) : next;
    });
  }, []);

  const handleLog = useCallback((log) => {
    setLogs(prev => {
      const next = [log, ...prev];
      return next.length > 200 ? next.slice(0, 200) : next;
    });
  }, []);

  const handleConnection = useCallback((c) => setConnected(c), []);

  // SSE connection
  const { reconnect } = useSSE(handleEvent, handleLog, handleConnection, [env]);

  // Env switching  
  const switchEnv = useCallback((newEnv) => {
    const prodUrl = isProdHost ? window.location.origin : 'https://atlas.onepassgym.com';
    setEnv(newEnv, prodUrl);
    setEnvState(newEnv);
    localStorage.setItem('atlas_env', newEnv);
    setEvents([]);
    setLogs([]);

    // Re-prompt for API key if needed
    const keyName = `atlas_api_key_${newEnv}`;
    let key = sessionStorage.getItem(keyName);
    if (!key) {
      key = prompt(`Enter Atlas05 API Key for [${newEnv.toUpperCase()}]:`);
      if (key) sessionStorage.setItem(keyName, key);
    }
    if (key) setApiKey(key);

    toast(`Switched to ${newEnv.toUpperCase()}`, 'info');
  }, [toast, isProdHost]);

  // Load event history on mount
  useEffect(() => {
    api.get('/api/events/history?limit=30')
      .then(res => {
        if (res?.success && res.events?.length) {
          setEvents(res.events.reverse());
        }
      })
      .catch(() => {});
  }, [env]);

  const clearLogs = useCallback(() => setLogs([]), []);
  const clearEvents = useCallback(() => setEvents([]), []);

  const value = {
    env,
    switchEnv,
    isProdHost,
    connected,
    events,
    logs,
    clearLogs,
    clearEvents,
    chainsCache,
    setChainsCache,
    toast,
    toasts,
    reconnect,
    theme,
    toggleTheme,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
