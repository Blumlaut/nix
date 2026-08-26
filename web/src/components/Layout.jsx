import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import { initTheme } from '../theme';

export default function Layout() {
  useEffect(() => { initTheme(); }, []);

  return (
    <>
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
      <Header />
      <main>
        <Outlet />
      </main>
      <footer className="page-foot">made with <a href="/nix">nix</a></footer>
    </>
  );
}
