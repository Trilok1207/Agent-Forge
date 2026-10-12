import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { appConfig } from '@/config/app';
import { ErrorBoundary } from './ErrorBoundary';

export function AppLayout() {
  const location = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <NavLink to="/" className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">
            ◇
          </span>
          {appConfig.name}
        </NavLink>
        <nav aria-label="Main">
          <ul className="topbar__nav">
            <li>
              <NavLink to="/" end>
                Projects
              </NavLink>
            </li>
            <li>
              <NavLink to="/about">How it works</NavLink>
            </li>
          </ul>
        </nav>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="footer">
        {appConfig.name} · Simulation for analysis and education. Results are model outputs, not guarantees.
      </footer>
    </>
  );
}
