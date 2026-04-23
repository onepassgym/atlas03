import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Header from './components/Header';
import TabNav from './components/TabNav';
import ToastContainer from './components/Toast';
import Globe from './components/Globe';
import Skeleton from './components/Skeleton';

const Overview  = lazy(() => import('./pages/Overview'));
const Explorer  = lazy(() => import('./pages/Explorer'));
const Chains    = lazy(() => import('./pages/Chains'));
const Jobs      = lazy(() => import('./pages/Jobs'));
const GlobePage = lazy(() => import('./pages/GlobePage'));
const System    = lazy(() => import('./pages/System'));
const Enrichment = lazy(() => import('./pages/Enrichment'));
const DataHealth = lazy(() => import('./pages/DataHealth'));

function PageLoader() {
  return (
    <div className="container">
      <Skeleton height={80} count={3} style={{ marginBottom: 12 }} />
    </div>
  );
}

function AppShell() {
  const { chainsCache } = useApp();

  return (
    <>
      <Globe />
      <Header />
      <TabNav badges={{ chainCount: chainsCache.length || 0 }} />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/chains"   element={<Chains />} />
          <Route path="/jobs"     element={<Jobs />} />
          <Route path="/globe"    element={<GlobePage />} />
          <Route path="/system"   element={<System />} />
          <Route path="/enrichment" element={<Enrichment />} />
          <Route path="/data-health" element={<DataHealth />} />
          <Route path="*"         element={<Navigate to="/overview" replace />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </HashRouter>
  );
}
