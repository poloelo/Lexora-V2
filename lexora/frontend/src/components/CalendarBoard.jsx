/**
 * CalendarBoard.jsx — Calendrier unifié (composant réutilisable)
 *
 * Anciennement la page Calendrier.jsx : le calendrier vit désormais dans
 * le Dashboard (hub unique). La logique métier est inchangée : une seule
 * source /api/evenements, le backend applique les règles de visibilité
 * (général / planning de département / personnel).
 *
 * Deux modes :
 *  - interactif (défaut) : charge ses données, clic sur créneau → modal
 *    de création (type "Planning équipe" pour manager/admin avec sélecteur
 *    d'employé et couleur verte imposée ; palette de couleurs et case
 *    "personnel" sinon), clic sur événement → détail + suppression selon
 *    les droits
 *  - lecture seule (readOnly + events fournis en props) : consultation du
 *    dashboard d'un employé par son manager — le détail reste consultable
 *    mais aucune création/suppression n'est possible
 *
 * CSS de react-big-calendar : importé ici, surchargé dans index.css (.rbc-*)
 */

import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';

import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

// ── Configuration du localizer en français ────────────────
const localizer = dateFnsLocalizer({
  format,
  parse,
  // On force la semaine à commencer le lundi (weekStartsOn: 1)
  startOfWeek: date => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { fr },
});

// ── Traductions françaises des labels du calendrier ───────
const MESSAGES_FR = {
  today:            "Aujourd'hui",
  previous:         '‹',
  next:             '›',
  month:            'Mois',
  week:             'Semaine',
  day:              'Jour',
  agenda:           'Agenda',
  date:             'Date',
  time:             'Heure',
  event:            'Événement',
  noEventsInRange:  'Aucun événement sur cette période.',
  showMore:         total => `+ ${total} de plus`,
};

// ── Couleurs par défaut par type d'événement ──────────────
// Servent de légende et de couleur de repli ; la couleur réelle de chaque
// événement vient de la base (choisie par l'utilisateur à la création).
const TYPE_COULEURS = {
  rdv:       { bg: '#7c6af7', text: '#fff', label: 'Rendez-vous' },
  tache:     { bg: '#3b82f6', text: '#fff', label: 'Tâche'       },
  rappel:    { bg: '#f59e0b', text: '#fff', label: 'Rappel'      },
  evenement: { bg: '#8b5cf6', text: '#fff', label: 'Événement'   },
  planning:  { bg: '#10b981', text: '#fff', label: 'Planning'    },
};

// Palette proposée pour les événements non-planning.
// Le vert #10b981 en est volontairement absent : il est réservé au planning
// pour que celui-ci reste identifiable d'un coup d'œil.
const COULEURS = ['#7c6af7', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// ── Valeur vide du formulaire de création ─────────────────
const FORM_VIDE = {
  titre: '', description: '', date_debut: '', date_fin: '',
  type: 'rdv', couleur: COULEURS[0], employe_id: '', personnel: false,
};

// ── Helper : convertit une Date JS en valeur datetime-local ──
const toDatetimeLocal = date =>
  format(date instanceof Date ? date : new Date(date), "yyyy-MM-dd'T'HH:mm");

// Conversion d'une ligne API → format react-big-calendar { title, start, end }
const toCalendarEvent = e => ({
  id:             e.id,
  // Le planning affiche le nom de l'employé concerné en préfixe
  title:          e.type === 'planning' && e.employe_nom
                    ? `${e.employe_nom} — ${e.titre}`
                    : e.titre,
  start:          new Date(e.date_debut),
  end:            new Date(e.date_fin ?? e.date_debut),
  type:           e.type ?? 'evenement',
  couleur:        e.couleur,
  description:    e.description,
  employe_id:     e.employe_id,
  employe_nom:    e.employe_nom,
  created_by_id:  e.created_by_id,
  created_by_nom: e.created_by_nom,
});

// ── Composant Modal générique ──────────────────────────────
// Ferme au clic sur le fond sombre, pas au clic sur le contenu.
function Modal({ onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────
export default function CalendarBoard({ readOnly = false, events: externalEvents = null }) {
  const { user, authHeaders } = useAuth();
  const toast = useToast();

  // Tous les événements visibles (par l'utilisateur ou par la cible consultée)
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(!readOnly);
  // Annuaire minimal pour le sélecteur "planning de qui ?" (manager/admin)
  const [employes, setEmployes] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail]         = useState(null);
  const [form, setForm]             = useState(FORM_VIDE);
  const [saving, setSaving]         = useState(false);

  // Manager/admin : peuvent poser du planning sur un employé
  const canPlan = !readOnly && (user?.role === 'manager' || user?.role === 'admin');

  // En lecture seule, les données viennent des props (dashboard consulté)
  useEffect(() => {
    if (readOnly) setEvents((Array.isArray(externalEvents) ? externalEvents : []).map(toCalendarEvent));
  }, [readOnly, externalEvents]);

  const loadEvents = async () => {
    try {
      const data = await fetch('/api/evenements', { headers: authHeaders })
        .then(r => (r.ok ? r.json() : []));
      setEvents((Array.isArray(data) ? data : []).map(toCalendarEvent));
    } catch {
      toast('Impossible de charger les événements', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (readOnly) return;    // Pas de fetch : les données sont passées en props
    loadEvents();
    if (canPlan) {
      fetch('/api/employes/selector', { headers: authHeaders })
        .then(r => (r.ok ? r.json() : []))
        .then(data => setEmployes(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [readOnly]);

  // ── Clic sur un créneau vide → ouvre le formulaire ──────
  const handleSelectSlot = ({ start, end }) => {
    // En vue "mois", end est minuit du lendemain → on force 1h après le début
    const endCorrige = end <= start
      ? new Date(start.getTime() + 60 * 60 * 1000)
      : end;

    setForm({
      ...FORM_VIDE,
      date_debut: toDatetimeLocal(start),
      date_fin:   toDatetimeLocal(endCorrige),
    });
    setShowCreate(true);
  };

  const handleSelectEvent = event => setDetail(event);

  // ── Création d'un événement ──────────────────────────────
  const handleCreate = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const isPlanning = form.type === 'planning';
      const body = {
        titre:       form.titre,
        description: form.description || null,
        date_debut:  form.date_debut,
        date_fin:    form.date_fin || form.date_debut,
        type:        form.type,
      };
      if (isPlanning) {
        // Le backend impose la couleur verte : inutile de l'envoyer
        body.employe_id = Number(form.employe_id);
      } else {
        body.couleur = form.couleur;
        // Case "personnel" cochée → l'événement me cible (visible par moi + mon manager)
        if (form.personnel) body.employe_id = user.id;
      }

      const res = await fetch('/api/evenements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShowCreate(false);
      setForm(FORM_VIDE);
      await loadEvents();
      toast('Événement créé');
    } catch (err) {
      toast(err.message || 'Erreur lors de la création', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Droits de suppression (miroir du backend, pour l'affichage) ──
  // Le backend reste l'autorité : ici on ne fait que cacher le bouton.
  const canDelete = event => {
    if (readOnly) return false;   // Consultation : aucune action
    if (user?.role === 'admin') return true;
    if (event.type === 'planning') return user?.role === 'manager';
    return event.created_by_id === user?.id;
  };

  const handleDelete = async event => {
    try {
      const res = await fetch(`/api/evenements/${event.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetail(null);
      // Retrait immédiat de l'état local, plus réactif qu'un rechargement complet
      setEvents(prev => prev.filter(e => e.id !== event.id));
      toast('Événement supprimé');
    } catch (err) {
      toast(err.message || 'Erreur lors de la suppression', 'error');
    }
  };

  // ── Couleur dynamique par événement ──────────────────────
  const eventPropGetter = event => {
    const bg = event.couleur ?? TYPE_COULEURS[event.type]?.bg ?? TYPE_COULEURS.evenement.bg;
    return {
      style: {
        backgroundColor: bg,
        color:           '#fff',
        border:          'none',
        borderRadius:    '5px',
        fontSize:        '0.8rem',
        padding:         '2px 6px',
      },
    };
  };

  return (
    <div>
      {/* Légende des couleurs par type */}
      <div className="cal-legend" style={{ marginBottom: 10 }}>
        {Object.entries(TYPE_COULEURS).map(([type, { bg, label }]) => (
          <span key={type} className="cal-legend-item">
            <span className="cal-legend-dot" style={{ background: bg }} />
            {label}
          </span>
        ))}
      </div>

      {/* Calendrier principal */}
      {loading ? (
        <div className="cal-loading">
          <span className="spinner dark" /> Chargement du calendrier...
        </div>
      ) : (
        <div className="cal-wrapper">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            style={{ height: 620 }}
            culture="fr"
            messages={MESSAGES_FR}
            views={['month', 'week', 'day']}
            defaultView="week"
            selectable={!readOnly}   // La sélection de créneaux crée un événement
            onSelectSlot={readOnly ? undefined : handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventPropGetter}
            step={30}               // Pas de 30 minutes en vue semaine/jour
            timeslots={2}           // 2 cases par "step" → graduations toutes les 30min
            scrollToTime={new Date(0, 0, 0, 8, 0)}  // Vue semaine : commence à 8h
          />
        </div>
      )}

      {/* ── Modal : Créer un événement (mode interactif) ── */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <div className="modal-header">
            <span className="modal-title">Nouvel événement</span>
            <button className="modal-close" type="button" onClick={() => setShowCreate(false)}>✕</button>
          </div>

          <form onSubmit={handleCreate}>
            <div className="modal-body">

              <div className="form-group">
                <label>Titre *</label>
                <input
                  value={form.titre}
                  onChange={e => setForm(p => ({ ...p, titre: e.target.value }))}
                  placeholder="Ex : Réunion client, Livraison matériel..."
                  required
                />
              </div>

              <div className="form-group">
                <label>Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                >
                  <option value="rdv">Rendez-vous</option>
                  <option value="tache">Tâche</option>
                  <option value="rappel">Rappel</option>
                  <option value="evenement">Événement</option>
                  {/* Seuls manager et admin posent du planning */}
                  {canPlan && <option value="planning">Planning (équipe)</option>}
                </select>
              </div>

              {form.type === 'planning' ? (
                /* Planning : on cible un employé, couleur verte imposée */
                <div className="form-group">
                  <label>Pour l'employé *</label>
                  <select
                    value={form.employe_id}
                    onChange={e => setForm(p => ({ ...p, employe_id: e.target.value }))}
                    required
                  >
                    <option value="">— Choisir —</option>
                    {employes.map(emp => <option key={emp.id} value={emp.id}>{emp.nom}</option>)}
                  </select>
                  <p style={{ fontSize: '0.78rem', color: '#aaa', marginTop: 4 }}>
                    Visible par tout le département de l'employé — couleur verte imposée.
                  </p>
                </div>
              ) : (
                <>
                  {/* Choix de la couleur (mêmes pastilles que les post-its) */}
                  <div className="form-group">
                    <label>Couleur</label>
                    <div className="postit-colors">
                      {COULEURS.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={`postit-color-swatch${form.couleur === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setForm(p => ({ ...p, couleur: c }))}
                          title="Couleur de l'événement"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Général (visible par tous) ou personnel (moi + mon manager) */}
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.personnel}
                        onChange={e => setForm(p => ({ ...p, personnel: e.target.checked }))}
                        style={{ width: 'auto' }}
                      />
                      Événement personnel (visible par vous et votre manager)
                    </label>
                  </div>
                </>
              )}

              {/* Les deux champs date sont sur la même ligne */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Début *</label>
                  <input
                    type="datetime-local"
                    value={form.date_debut}
                    onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Fin</label>
                  <input
                    type="datetime-local"
                    value={form.date_fin}
                    onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows="2"
                  placeholder="Notes, lieu, participants..."
                  style={{ resize: 'vertical' }}
                />
              </div>

            </div>

            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setShowCreate(false)}>
                Annuler
              </button>
              <button type="submit" disabled={saving}>
                {saving ? <><span className="spinner" /> Création...</> : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal : Détail d'un événement (consultable même en lecture seule) ── */}
      {detail && (
        <Modal onClose={() => setDetail(null)}>
          <div className="modal-header">
            <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: detail.couleur ?? TYPE_COULEURS[detail.type]?.bg ?? '#7c6af7',
                  flexShrink: 0,
                }}
              />
              {detail.title}
            </span>
            <button className="modal-close" type="button" onClick={() => setDetail(null)}>✕</button>
          </div>

          <div className="modal-body">
            <span className={`badge ${detail.type === 'planning' ? 'badge-in-progress' : 'badge-done'}`}>
              {TYPE_COULEURS[detail.type]?.label ?? detail.type}
            </span>

            <div className="modal-detail-row">
              <span className="modal-detail-label">Début</span>
              <span>{detail.start.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
            </div>
            <div className="modal-detail-row">
              <span className="modal-detail-label">Fin</span>
              <span>{detail.end.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
            </div>

            {detail.employe_nom && (
              <div className="modal-detail-row">
                <span className="modal-detail-label">Pour</span>
                <span>{detail.employe_nom}</span>
              </div>
            )}
            {detail.created_by_nom && (
              <div className="modal-detail-row">
                <span className="modal-detail-label">Créé par</span>
                <span>{detail.created_by_nom}</span>
              </div>
            )}

            {detail.description && (
              <div className="modal-detail-row" style={{ alignItems: 'flex-start' }}>
                <span className="modal-detail-label">Notes</span>
                <span style={{ whiteSpace: 'pre-line', color: '#555' }}>{detail.description}</span>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={() => setDetail(null)}>Fermer</button>
            {canDelete(detail) && (
              <button className="danger" onClick={() => handleDelete(detail)}>Supprimer</button>
            )}
          </div>
        </Modal>
      )}

    </div>
  );
}
