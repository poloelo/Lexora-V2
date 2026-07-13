import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';

import Dashboard       from './pages/Dashboard.jsx';
import Clients         from './pages/Clients.jsx';
import CoffreFort      from './pages/Coffre_fort.jsx';
import Assistant       from './pages/Assistant.jsx';
import Equipe          from './pages/Equipe.jsx';
import Login           from './pages/Login.jsx';

// ── Gardes de route ───────────────────────────────────────
// Toute l'API exige désormais un JWT : l'application entière est derrière
// le login (hors page /login elle-même).
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// La page Équipe sert aussi aux managers (consultation des dashboards de
// leur département) — plus seulement à l'admin.
function ManagerRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin' && user?.role !== 'manager') return <Navigate to="/" replace />;
  return children;
}

// ── Navigation principale ─────────────────────────────────
// Tâches et Calendrier ne sont plus des pages : leur contenu vit dans le
// Dashboard (hub unique) — voir pages/Dashboard.jsx.
const NAV_PRINCIPAL = [
  { to: '/',           label: 'Dashboard',    icon: '▦', end: true },
  { to: '/clients',    label: 'Clients',      icon: '◉' },
  { to: '/documents',  label: 'Documents',    icon: '📁' },
  { to: '/assistant',  label: 'Assistant IA', icon: '◈' },
];

// ── Sidebar ───────────────────────────────────────────────
function Sidebar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin   = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const nomCourt  = user?.prenom || user?.nom || '';

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
      {/* L'espace personnel (post-its, tâches, calendrier) est intégré au
          Dashboard. Le lien Équipe s'affiche pour l'admin (gestion des
          employés + tous les dashboards) et le manager (dashboards de son
          département, lecture seule). */}
      {isAuthenticated ? (
        <div className="sidebar-admin-section">
          {(isAdmin || isManager) && (
            <>
              <span className="sidebar-section-label">{isAdmin ? 'Administration' : 'Management'}</span>
              <ul>
                <li>
                  <NavLink to="/equipe">
                    <span className="nav-icon">◎</span>
                    Équipe
                  </NavLink>
                </li>
              </ul>
            </>
          )}
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
          <Route path="/clients"    element={<Clients />} />
          <Route path="/documents"  element={<CoffreFort />} />
          <Route path="/assistant"  element={<Assistant />} />
          <Route path="/equipe"     element={<ManagerRoute><Equipe /></ManagerRoute>} />
          {/* Ancienne page "Mon espace" fusionnée dans le Dashboard */}
          <Route path="/mon-espace" element={<Navigate to="/" replace />} />
          {/* Ancienne page "Clients & Factures" — Factures retirée du périmètre */}
          <Route path="/business" element={<Navigate to="/clients" replace />} />
          {/* Anciennes pages Tâches et Calendrier — contenu déplacé dans le Dashboard */}
          <Route path="/taches"     element={<Navigate to="/" replace />} />
          <Route path="/calendrier" element={<Navigate to="/" replace />} />
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
          {/* Toutes les autres pages — avec sidebar, connexion requise */}
          <Route path="/*" element={<PrivateRoute><AppLayout /></PrivateRoute>} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
