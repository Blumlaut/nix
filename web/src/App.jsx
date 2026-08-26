import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

// Route-level code splitting keeps the initial bundle small.
const Board = lazy(() => import('./pages/Board'));
const Stats = lazy(() => import('./pages/Stats'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Forum = lazy(() => import('./pages/Forum'));
const Changelog = lazy(() => import('./pages/Changelog'));
const Rules = lazy(() => import('./pages/Rules'));

export default function App() {
  return (
    <Suspense fallback={<div className="card" style={{ margin: '1rem' }}>Loading…</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Board />} />
          <Route path="/setup" element={<Board />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/forum/thread/:id" element={<Forum />} />
          <Route path="/user/:id" element={<Profile />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="*" element={<Board />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
