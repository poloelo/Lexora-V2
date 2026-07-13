/**
 * Dashboard.jsx — Page d'accueil unifiée
 *
 * Fusion de l'ancien "Mon espace" et du dashboard KPI : cette page sert
 * désormais d'espace personnel pour tout utilisateur connecté (admin compris) :
 *  - KPI animés (tâches, factures) — visibles même déconnecté
 *  - Mur de post-its (todos personnels) — connecté uniquement
 *  - Mon planning : prochaine journée + tableau des créneaux — connecté uniquement
 *  - Listes des tâches et factures récentes
 */

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import PostItWall from '../components/PostItWall.jsx';

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const frame = now => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(frame);
      else prev.current = target;
    };
    requestAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

const CARD_COLORS = [
  '#7c6af7',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#10b981',
];

function StatCard({ icon, value, label, color, suffix = '' }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <div className="stat-card" style={{ '--accent': color }}>
      <span className="stat-icon">{icon}</span>
      <div className="number">{animated}{suffix}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function RecentItem({ name, badge, badgeClass }) {
  return (
    <div className="recent-item">
      <span className="recent-item-name">{name}</span>
      {badge && <span className={`badge ${badgeClass}`}>{badge}</span>}
    </div>
  );
}

const STATUT_TACHE = {
  todo:        { label: 'À faire',  cls: 'badge-todo' },
  in_progress: { label: 'En cours', cls: 'badge-in-progress' },
  done:        { label: 'Terminé',  cls: 'badge-done' },
};

const STATUT_FACTURE = {
  'en attente': { label: 'En attente', cls: 'badge-pending' },
  payee:        { label: 'Payée',      cls: 'badge-paid' },
  annulee:      { label: 'Annulée',    cls: 'badge-cancelled' },
};

// Formate une date "2025-06-15" en "dimanche 15 juin"
const fmtDate = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—';

// Prend "09:00" et "17:30" → renvoie "8h30"
function calculerDuree(debut, fin) {
  if (!debut || !fin) return null;
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  const total = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h${m}` : `${h}h`;
}

export default function Dashboard() {
  const { user, authHeaders, isAuthenticated } = useAuth();
  const [taches, setTaches]     = useState([]);
  const [factures, setFactures] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [filtre, setFiltre]     = useState('a_venir'); // 'a_venir' | 'tous'
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      // /api/tasks est protégé par JWT : sans connexion, les stats tombent à zéro
      fetch('/api/tasks', { headers: authHeaders })
        .then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/factures').then(r => r.json()).catch(() => []),
      fetch('/api/planning').then(r => r.json()).catch(() => []),
    ]).then(([t, f, p]) => {
      setTaches(Array.isArray(t) ? t : []);
      setFactures(Array.isArray(f) ? f : []);
      // Filtre par clé étrangère : fiable même en cas d'homonymes
      const all = Array.isArray(p) ? p : [];
      setPlanning(all.filter(e => e.employe_id === user?.id));
      setLoading(false);
    });
  }, [user?.id]);

  const tachesEnCours    = taches.filter(t => t.status === 'in_progress').length;
  const facturesImpayees = factures.filter(f => f.statut === 'en attente').length;
  const totalFactures    = factures.reduce((s, f) => s + (f.montant || 0), 0);

  // L'API retourne déjà les éléments triés du plus récent au plus ancien
  // (ORDER BY created_at DESC / ORDER BY id DESC).
  // On prend simplement les 5 premiers — pas besoin de reverse().
  const recentTaches   = taches.slice(0, 5);
  const recentFactures = factures.slice(0, 5);

  const todayStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const today = new Date().toISOString().slice(0, 10);
  const affichage = filtre === 'a_venir'
    ? planning.filter(e => e.date >= today)
    : planning;

  // Prochaine journée de travail
  const prochain = [...planning]
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <div className="page-enter">
      <h1>{isAuthenticated ? <>Bonjour, {user?.prenom || user?.nom} 👋</> : 'Dashboard'}</h1>
      <p className="page-subtitle">
        {todayStr}
        {isAuthenticated && user?.poste && <> · {user.poste}</>}
      </p>

      {loading ? (
        <div className="stats-grid">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8, margin: '0 auto 10px' }} />
              <div className="skeleton" style={{ width: 70, height: 32, margin: '0 auto 8px' }} />
              <div className="skeleton" style={{ width: 90, height: 14, margin: '0 auto' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="stats-grid">
          <StatCard icon="✓" value={taches.length}    label="Tâches totales"    color={CARD_COLORS[0]} />
          <StatCard icon="◷" value={tachesEnCours}    label="En cours"          color={CARD_COLORS[1]} />
          <StatCard icon="€" value={factures.length}  label="Factures"          color={CARD_COLORS[2]} />
          <StatCard icon="⏳" value={facturesImpayees} label="En attente"        color={CARD_COLORS[3]} />
          <StatCard icon="∑" value={Math.round(totalFactures)} label="Volume total (€)" color={CARD_COLORS[4]} />
        </div>
      )}

      {/* ── Espace personnel (utilisateur connecté) ─────────── */}
      {isAuthenticated && (
        <>
          {/* Mur de post-its (todos personnels) */}
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '1.5rem 0 0.75rem' }}>📌 Mes post-its</h2>
          <PostItWall />

          {/* Carte prochaine journée */}
          {prochain && (
            <div className="mon-espace-next">
              <span className="mon-espace-next-label">Prochaine journée</span>
              <strong>{fmtDate(prochain.date)}</strong>
              <span>{prochain.heure_debut} → {prochain.heure_fin}</span>
              {prochain.projet && <span className="badge badge-in-progress">{prochain.projet}</span>}
              {calculerDuree(prochain.heure_debut, prochain.heure_fin) && (
                <span style={{ color: '#888', fontSize: '0.85rem' }}>
                  {calculerDuree(prochain.heure_debut, prochain.heure_fin)} de travail
                </span>
              )}
            </div>
          )}

          {/* Tableau planning personnel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0 0.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Mon planning</h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                className={filtre === 'a_venir' ? 'btn-filter active' : 'btn-filter'}
                onClick={() => setFiltre('a_venir')}
              >À venir</button>
              <button
                className={filtre === 'tous' ? 'btn-filter active' : 'btn-filter'}
                onClick={() => setFiltre('tous')}
              >Tout</button>
            </div>
            <span className="record-count">{affichage.length} créneau{affichage.length !== 1 ? 'x' : ''}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Durée</th>
                <th>Projet</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="loading-row">
                  <td colSpan="5"><span className="spinner dark" /> Chargement...</td>
                </tr>
              )}
              {!loading && affichage.length === 0 && (
                <tr><td colSpan="5">
                  <div className="empty-state">
                    <div className="empty-state-icon">◫</div>
                    <p>{filtre === 'a_venir' ? 'Aucun créneau à venir' : 'Aucun créneau enregistré'}</p>
                  </div>
                </td></tr>
              )}
              {!loading && affichage
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(e => (
                  <tr key={e.id} style={e.date === today ? { background: '#f0eeff' } : {}}>
                    <td style={{ fontWeight: e.date === today ? 600 : 400 }}>
                      {fmtDate(e.date)}
                      {e.date === today && <span className="badge badge-in-progress" style={{ marginLeft: 6 }}>Aujourd'hui</span>}
                    </td>
                    <td>{e.heure_debut}</td>
                    <td>{e.heure_fin}</td>
                    <td>
                      {calculerDuree(e.heure_debut, e.heure_fin) && (
                        <span className="badge">{calculerDuree(e.heure_debut, e.heure_fin)}</span>
                      )}
                    </td>
                    <td style={{ color: '#666' }}>{e.projet || <span style={{ color: '#ccc' }}>—</span>}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </>
      )}

      <div className="dashboard-grid">
        <div className="recent-section">
          <div className="recent-header">✓ Tâches récentes</div>
          {recentTaches.length === 0 ? (
            <div className="empty-state"><p>Aucune tâche</p></div>
          ) : recentTaches.map(t => {
            const s = STATUT_TACHE[t.status] || { label: t.status, cls: 'badge-todo' };
            return <RecentItem key={t.id} name={t.title} badge={s.label} badgeClass={s.cls} />;
          })}
        </div>

        <div className="recent-section">
          <div className="recent-header">€ Factures récentes</div>
          {recentFactures.length === 0 ? (
            <div className="empty-state"><p>Aucune facture</p></div>
          ) : recentFactures.map(f => {
            const s = STATUT_FACTURE[f.statut] || { label: f.statut, cls: 'badge-pending' };
            return <RecentItem key={f.id} name={`${f.client} — ${f.montant} €`} badge={s.label} badgeClass={s.cls} />;
          })}
        </div>
      </div>
    </div>
  );
}
