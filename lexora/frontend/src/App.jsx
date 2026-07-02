import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';

import Dashboard       from './pages/Dashboard.jsx';
import Taches          from './pages/Taches.jsx';
import ClientsFactures from './pages/ClientsFactures.jsx';
import Calendrier      from './pages/Calendrier.jsx';
import CoffreFort      from './pages/Coffre_fort.jsx';
import Assistant       from './pages/Assistant.jsx';
import Equipe          from './pages/Equipe.jsx';
import MonEspace       from './pages/MonEspace.jsx';
import Login           from './pages/Login.jsx';

// ── Gardes de route ───────────────────────────────────────
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/mon-espace" replace />;
  return children;
}

// ── Navigation principale ─────────────────────────────────
const NAV_PRINCIPAL = [
  { to: '/',           label: 'Dashboard',          icon: '▦', end: true },
  { to: '/taches',     label: 'Tâches',             icon: '✓' },
  { to: '/business',   label: 'Clients & Factures', icon: '€' },
  { to: '/calendrier', label: 'Calendrier',         icon: '◫' },
  { to: '/documents',  label: 'Documents',          icon: '📁' },
  { to: '/assistant',  label: 'Assistant IA',       icon: '◈' },
];

// ── Sidebar ───────────────────────────────────────────────
function Sidebar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin  = user?.role === 'admin';
  const nomCourt = user?.prenom || user?.nom || '';

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">L</span>
        Lexora
      </div>

      <ul>
        {NAV_PRINCIPAL.map(({ to, label, icon, end }) => (
          <li key={to}>
            <NavLink to={to} end={end}>
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-spacer" />

      {/* Section utilisateur connecté */}
      {isAuthenticated ? (
        <div className="sidebar-admin-section">
          <span className="sidebar-section-label">
            {isAdmin ? 'Administration' : 'Mon compte'}
          </span>
          <ul>
            {isAdmin ? (
              <li>
                <NavLink to="/equipe">
                  <span className="nav-icon">◎</span>
                  Équipe
                </NavLink>
              </li>
            ) : (
              <li>
                <NavLink to="/mon-espace">
                  <span className="nav-icon">◎</span>
                  Mon espace
                </NavLink>
              </li>
            )}
          </ul>
          {/* Carte utilisateur */}
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">{nomCourt.charAt(0).toUpperCase()}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{[user?.prenom, user?.nom].filter(Boolean).join(' ')}</span>
              <span className="sidebar-user-role">{isAdmin ? 'Administrateur' : (user?.poste || 'Employé')}</span>
            </div>
            <button className="sidebar-logout-btn" onClick={handleLogout} title="Déconnexion">⏻</button>
          </div>
        </div>
      ) : (
        <div className="sidebar-admin-section">
          <ul>
            <li>
              <NavLink to="/login">
                <span className="nav-icon">◉</span>
                Connexion
              </NavLink>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}

// ── Layout principal (avec sidebar) ──────────────────────
function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/"           element={<Dashboard />} />
          <Route path="/taches"     element={<Taches />} />
          <Route path="/business"   element={<ClientsFactures />} />
          <Route path="/calendrier" element={<Calendrier />} />
          <Route path="/documents"  element={<CoffreFort />} />
          <Route path="/assistant"  element={<Assistant />} />
          <Route path="/equipe"     element={<AdminRoute><Equipe /></AdminRoute>} />
          <Route path="/mon-espace" element={<PrivateRoute><MonEspace /></PrivateRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Page de login — plein écran, sans sidebar */}
          <Route path="/login" element={<Login />} />
          {/* Toutes les autres pages — avec sidebar */}
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
