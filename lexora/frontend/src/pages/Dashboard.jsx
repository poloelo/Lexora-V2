/**
 * Dashboard.jsx — Page d'accueil unifiée
 *
 * Fusion de l'ancien "Mon espace" et du dashboard KPI : cette page sert
 * désormais d'espace personnel pour tout utilisateur connecté (admin compris) :
 *  - KPI animés (tâches) — visibles même déconnecté
 *  - Mur de post-its (todos personnels) — connecté uniquement
 *  - Mon planning : prochaine journée + tableau des créneaux — connecté uniquement
 *  - Liste des tâches récentes
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

const CARD_COLORS = ['#7c6af7', '#3b82f6'];

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

// Formate une date "2025-06-15" en "dimanche 15 juin"
const fmtDate = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—';

// Depuis le calendrier unifié, les créneaux sont des événements avec des
// dates ISO 8601 complètes ("2026-07-13T09:00:00") : on en extrait la
// partie date et la partie heure par découpage de chaîne.
const dateOf  = iso => iso?.slice(0, 10) ?? '';
const heureOf = iso => iso?.slice(11, 16) || '—';

// Durée entre deux dates ISO → "8h30", et "2j 4h" pour les événements longs
function calculerDuree(debutIso, finIso) {
  if (!debutIso || !finIso) return null;
  const total = Math.round((new Date(finIso) - new Date(debutIso)) / 60000);
  if (total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 24) {
    const j = Math.floor(h / 24);
    const reste = h % 24;
    return reste > 0 ? `${j}j ${reste}h` : `${j}j`;
  }
  return m > 0 ? `${h}h${m}` : `${h}h`;
}

export default function Dashboard() {
  const { user, authHeaders, isAuthenticated } = useAuth();
  const [taches, setTaches]     = useState([]);
  const [planning, setPlanning] = useState([]);
  const [filtre, setFiltre]     = useState('a_venir'); // 'a_venir' | 'tous'
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/tasks', { headers: authHeaders })
        .then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/evenements', { headers: authHeaders })
        .then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([t, ev]) => {
      setTaches(Array.isArray(t) ? t : []);
      // "Mon planning" = les événements qui me ciblent (planning posé par
      // mon manager + mes événements personnels) — filtre par clé étrangère
      const all = Array.isArray(ev) ? ev : [];
      setPlanning(all.filter(e => e.employe_id === user?.id));
      setLoading(false);
    });
  }, [user?.id]);

  const tachesEnCours = taches.filter(t => t.status === 'in_progress').length;

  // L'API retourne déjà les tâches triées du plus récent au plus ancien
  // (ORDER BY created_at DESC). On prend simplement les 5 premières —
  // pas besoin de reverse().
  const recentTaches = taches.slice(0, 5);

  const todayStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const today = new Date().toISOString().slice(0, 10);
  const affichage = filtre === 'a_venir'
    ? planning.filter(e => dateOf(e.date_debut) >= today)
    : planning;

  // Prochaine journée de travail
  const prochain = [...planning]
    .filter(e => dateOf(e.date_debut) >= today)
    .sort((a, b) => a.date_debut.localeCompare(b.date_debut))[0];

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
          <StatCard icon="✓" value={taches.length} label="Tâches totales" color={CARD_COLORS[0]} />
          <StatCard icon="◷" value={tachesEnCours} label="En cours"       color={CARD_COLORS[1]} />
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
              <strong>{fmtDate(dateOf(prochain.date_debut))}</strong>
              <span>{heureOf(prochain.date_debut)} → {heureOf(prochain.date_fin)}</span>
              <span className="badge badge-in-progress">{prochain.titre}</span>
              {calculerDuree(prochain.date_debut, prochain.date_fin) && (
                <span style={{ color: '#888', fontSize: '0.85rem' }}>
                  {calculerDuree(prochain.date_debut, prochain.date_fin)} de travail
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
                <th>Événement</th>
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
              {!loading && [...affichage]
                .sort((a, b) => a.date_debut.localeCompare(b.date_debut))
                .map(e => {
                  const jour = dateOf(e.date_debut);
                  return (
                    <tr key={e.id} style={jour === today ? { background: '#f0eeff' } : {}}>
                      <td style={{ fontWeight: jour === today ? 600 : 400 }}>
                        {fmtDate(jour)}
                        {jour === today && <span className="badge badge-in-progress" style={{ marginLeft: 6 }}>Aujourd'hui</span>}
                      </td>
                      <td>{heureOf(e.date_debut)}</td>
                      <td>{heureOf(e.date_fin)}</td>
                      <td>
                        {calculerDuree(e.date_debut, e.date_fin) && (
                          <span className="badge">{calculerDuree(e.date_debut, e.date_fin)}</span>
                        )}
                      </td>
                      <td style={{ color: '#666' }}>
                        {/* Pastille de la couleur choisie dans le calendrier */}
                        <span style={{
                          display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                          background: e.couleur || '#7c6af7', marginRight: 7,
                        }} />
                        {e.titre}
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </>
      )}

      <div className="recent-section">
        <div className="recent-header">✓ Tâches récentes</div>
        {recentTaches.length === 0 ? (
          <div className="empty-state"><p>Aucune tâche</p></div>
        ) : recentTaches.map(t => {
          const s = STATUT_TACHE[t.status] || { label: t.status, cls: 'badge-todo' };
          return <RecentItem key={t.id} name={t.title} badge={s.label} badgeClass={s.cls} />;
        })}
      </div>
    </div>
  );
}
