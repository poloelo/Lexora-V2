/**
 * Dashboard.jsx — Hub personnel unique
 *
 * Depuis la refonte "hub", cette page empile tout l'espace de travail de
 * l'utilisateur (les anciennes pages Tâches et Calendrier ont été déplacées
 * ici, leur logique est intacte — voir components/TaskBoard.jsx et
 * components/CalendarBoard.jsx) :
 *
 *  1. Header    : salutation, date, poste
 *  2. Post-its  : mur de post-its + création (components/PostItWall.jsx)
 *  3. Tâches    : kanban de département — création réservée manager/admin,
 *                 depuis SON dashboard uniquement
 *  4. Calendrier: calendrier unifié (général / planning / personnel)
 *
 * Deux modes :
 *  - personnel (défaut) : chaque section charge ses propres données
 *  - consultation (prop targetUser) : un manager consulte le dashboard d'un
 *    employé de son département (admin : tout le monde) en LECTURE SEULE
 *    totale — les trois sections sont alimentées par un unique appel
 *    GET /api/dashboard/:userId et n'exposent aucune action. Utilisé par
 *    la page Équipe, avec bandeau + bouton retour (prop onBack).
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PostItWall from '../components/PostItWall.jsx';
import TaskBoard from '../components/TaskBoard.jsx';
import CalendarBoard from '../components/CalendarBoard.jsx';

// Titre de section homogène pour les trois rubriques du hub
function SectionTitle({ icon, children }) {
  return (
    <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '1.75rem 0 0.75rem' }}>
      {icon} {children}
    </h2>
  );
}

export default function Dashboard({ targetUser = null, onBack = null }) {
  const { user, authHeaders } = useAuth();
  const toast = useToast();

  // Mode consultation : présence d'une cible = lecture seule totale
  const readOnly = !!targetUser;

  // Données agrégées du dashboard consulté ({ user, todos, tasks, evenements })
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(readOnly);

  useEffect(() => {
    if (!readOnly) return;   // Mode personnel : chaque section se charge seule
    setLoading(true);
    fetch(`/api/dashboard/${targetUser.id}`, { headers: authHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => {
        setLoading(false);
        toast('Impossible de charger ce dashboard', 'error');
      });
  }, [readOnly, targetUser?.id]);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // La fiche affichée : la cible consultée, ou soi-même
  const fiche = readOnly ? (data?.user ?? targetUser) : user;

  return (
    <div className="page-enter">

      {/* Bandeau de consultation (mode lecture seule uniquement) */}
      {readOnly && (
        <div className="readonly-banner">
          <span>
            👁 Dashboard de <strong>{[fiche?.prenom, fiche?.nom].filter(Boolean).join(' ')}</strong> (lecture seule)
          </span>
          <button className="secondary" onClick={onBack}>← Retour à l'équipe</button>
        </div>
      )}

      {/* 1. Header */}
      <h1>
        {readOnly
          ? [fiche?.prenom, fiche?.nom].filter(Boolean).join(' ')
          : <>Bonjour, {user?.prenom || user?.nom} 👋</>}
      </h1>
      <p className="page-subtitle">
        {today}
        {fiche?.poste && <> · {fiche.poste}</>}
        {readOnly && fiche?.departement_nom && <> · {fiche.departement_nom}</>}
      </p>

      {loading ? (
        <div className="cal-loading"><span className="spinner dark" /> Chargement du dashboard...</div>
      ) : (
        <>
          {/* 2. Post-its */}
          <SectionTitle icon="📌">{readOnly ? 'Ses post-its' : 'Mes post-its'}</SectionTitle>
          <PostItWall
            readOnly={readOnly}
            todos={readOnly ? data?.todos : null}
            perspectiveId={readOnly ? targetUser.id : null}
          />

          {/* 3. Tâches du département (kanban) */}
          <SectionTitle icon="✓">Tâches du département</SectionTitle>
          <TaskBoard
            readOnly={readOnly}
            tasks={readOnly ? data?.tasks : null}
          />

          {/* 4. Calendrier */}
          <SectionTitle icon="◫">Calendrier</SectionTitle>
          <CalendarBoard
            readOnly={readOnly}
            events={readOnly ? data?.evenements : null}
          />
        </>
      )}
    </div>
  );
}
