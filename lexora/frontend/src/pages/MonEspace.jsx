import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const fmtDate = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—';

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

export default function MonEspace() {
  const { user, logout, authHeaders } = useAuth();
  const navigate = useNavigate();
  const toast    = useToast();

  const [planning, setPlanning]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filtre, setFiltre]       = useState('a_venir'); // 'a_venir' | 'tous'

  const nomComplet = [user?.prenom, user?.nom].filter(Boolean).join(' ');

  useEffect(() => {
    fetch('/api/planning')
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : [];
        // Filtre les entrées qui correspondent au nom de cet employé
        const miennes = all.filter(e =>
          e.employe?.toLowerCase().trim() === nomComplet.toLowerCase().trim()
        );
        setPlanning(miennes);
        setLoading(false);
      })
      .catch(() => { toast('Erreur lors du chargement du planning', 'error'); setLoading(false); });
  }, [nomComplet]);

  const handleLogout = () => { logout(); navigate('/login'); };

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
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1>Bonjour, {user?.prenom || user?.nom} 👋</h1>
          <p className="page-subtitle">{user?.poste || 'Mon espace personnel'} · {user?.email}</p>
        </div>
        <button className="danger" style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem' }} onClick={handleLogout}>
          Déconnexion
        </button>
      </div>

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

      {/* Tableau planning */}
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
    </div>
  );
}
