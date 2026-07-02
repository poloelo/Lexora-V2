/**
 * Calendrier.jsx — Vue calendrier interactif
 *
 * Utilise react-big-calendar avec date-fns comme moteur de dates.
 *
 * Fonctionnalités :
 *  - Vues mois / semaine / jour (boutons en haut à droite)
 *  - Clic sur un créneau vide → ouvre un modal pour créer un événement
 *  - Clic sur un événement existant → ouvre un modal de détail + suppression
 *  - Les entrées de planning (table `planning`) apparaissent automatiquement
 *    dans le calendrier, converties en événements de type "planning"
 *  - Code couleur par type d'événement (voir TYPE_COULEURS)
 *
 * CSS de react-big-calendar : importé ici, surchargé dans index.css (section .rbc-*)
 */

import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';

import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';

// ── Configuration du localizer en français ────────────────
// Le localizer indique à react-big-calendar comment formater
// et parser les dates avec la bibliothèque date-fns.
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

// ── Couleurs par type d'événement ────────────────────────
// Chaque type a une couleur de fond et une couleur de texte.
// Ces couleurs s'appliquent via eventPropGetter sur le calendrier.
const TYPE_COULEURS = {
  rdv:       { bg: '#7c6af7', text: '#fff', label: 'Rendez-vous' },
  tache:     { bg: '#3b82f6', text: '#fff', label: 'Tâche'       },
  rappel:    { bg: '#f59e0b', text: '#fff', label: 'Rappel'      },
  evenement: { bg: '#8b5cf6', text: '#fff', label: 'Événement'   },
  planning:  { bg: '#10b981', text: '#fff', label: 'Planning'    },
};

// ── Valeur vide du formulaire de création ─────────────────
const FORM_VIDE = {
  titre: '', description: '', date_debut: '', date_fin: '', type: 'rdv',
};

// ── Helper : convertit une Date JS en valeur datetime-local ──
// Les <input type="datetime-local"> attendent "YYYY-MM-DDTHH:mm"
const toDatetimeLocal = date =>
  format(date instanceof Date ? date : new Date(date), "yyyy-MM-dd'T'HH:mm");

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

// ── Page principale ────────────────────────────────────────
export default function Calendrier() {
  // Tous les événements affichés dans le calendrier
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);

  // Modal de création : null = fermé, true = ouvert
  const [showCreate, setShowCreate] = useState(false);
  // Modal de détail : null = fermé, objet événement = ouvert
  const [detail, setDetail]         = useState(null);

  const [form, setForm]     = useState(FORM_VIDE);
  const [saving, setSaving] = useState(false);

  const toast = useToast();

  // ── Chargement des données ──────────────────────────────
  // On fusionne deux sources :
  //  1. /api/evenements  → événements créés dans le calendrier
  //  2. /api/planning    → entrées de planning (employés) converties en événements
  const loadEvents = async () => {
    try {
      const [evtsData, planData] = await Promise.all([
        fetch('/api/evenements').then(r => r.json()).catch(() => []),
        fetch('/api/planning').then(r => r.json()).catch(() => []),
      ]);

      // Conversion des événements (format API → format react-big-calendar)
      // react-big-calendar attend { title, start: Date, end: Date }
      const evts = (Array.isArray(evtsData) ? evtsData : []).map(e => ({
        id:          e.id,
        title:       e.titre,
        start:       new Date(e.date_debut),
        end:         new Date(e.date_fin ?? e.date_debut),
        type:        e.type ?? 'evenement',
        description: e.description,
        source:      'evenement',   // Pour distinguer les deux sources au clic
      }));

      // Conversion des entrées de planning
      // La table planning stocke date + heure séparément : on les concatène
      const plan = (Array.isArray(planData) ? planData : []).map(p => ({
        id:          `planning-${p.id}`,  // Préfixe pour éviter les collisions d'ID
        title:       `${p.employe}${p.projet ? ' — ' + p.projet : ''}`,
        start:       new Date(`${p.date}T${p.heure_debut}`),
        end:         new Date(`${p.date}T${p.heure_fin}`),
        type:        'planning',
        description: `Employé : ${p.employe}${p.projet ? '\nProjet : ' + p.projet : ''}`,
        source:      'planning',
      }));

      setEvents([...evts, ...plan]);
    } catch {
      toast('Impossible de charger les événements', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);

  // ── Clic sur un créneau vide → ouvre le formulaire ──────
  // react-big-calendar passe { start, end } comme objets Date
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

  // ── Clic sur un événement existant → ouvre le détail ────
  const handleSelectEvent = event => setDetail(event);

  // ── Création d'un événement ──────────────────────────────
  const handleCreate = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/api/evenements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          titre:       form.titre,
          description: form.description || null,
          date_debut:  form.date_debut,
          date_fin:    form.date_fin || form.date_debut,
          type:        form.type,
        }),
      });
      setShowCreate(false);
      setForm(FORM_VIDE);
      await loadEvents();
      toast('Événement créé');
    } catch {
      toast('Erreur lors de la création', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Suppression d'un événement ───────────────────────────
  const handleDelete = async event => {
    // Les événements issus du planning se gèrent dans la page Équipe
    if (event.source === 'planning') {
      toast('Les entrées de planning se suppriment dans la page Équipe', 'info');
      setDetail(null);
      return;
    }
    try {
      await fetch(`/api/evenements/${event.id}`, { method: 'DELETE' });
      setDetail(null);
      // Retrait immédiat de l'état local, plus réactif qu'un rechargement complet
      setEvents(prev => prev.filter(e => e.id !== event.id));
      toast('Événement supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  // ── Couleur dynamique par type ───────────────────────────
  // eventPropGetter est une prop de Calendar qui permet de modifier
  // le style CSS de chaque événement individuellement.
  const eventPropGetter = event => {
    const couleurs = TYPE_COULEURS[event.type] ?? TYPE_COULEURS.evenement;
    return {
      style: {
        backgroundColor: couleurs.bg,
        color:           couleurs.text,
        border:          'none',
        borderRadius:    '5px',
        fontSize:        '0.8rem',
        padding:         '2px 6px',
      },
    };
  };

  return (
    <div className="page-enter">

      {/* En-tête : titre + légende des couleurs */}
      <div className="cal-header">
        <div>
          <h1>Calendrier</h1>
          <p className="page-subtitle">Cliquez sur un créneau pour créer un événement</p>
        </div>
        <div className="cal-legend">
          {Object.entries(TYPE_COULEURS).map(([type, { bg, label }]) => (
            <span key={type} className="cal-legend-item">
              <span className="cal-legend-dot" style={{ background: bg }} />
              {label}
            </span>
          ))}
        </div>
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
            style={{ height: 680 }}
            culture="fr"
            messages={MESSAGES_FR}
            views={['month', 'week', 'day']}
            defaultView="week"
            selectable              // Active la sélection de créneaux
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventPropGetter}
            step={30}               // Pas de 30 minutes en vue semaine/jour
            timeslots={2}           // 2 cases par "step" → graduations toutes les 30min
            scrollToTime={new Date(0, 0, 0, 8, 0)}  // Vue semaine : commence à 8h
          />
        </div>
      )}

      {/* ── Modal : Créer un événement ──────────────────── */}
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
                </select>
              </div>

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

      {/* ── Modal : Détail d'un événement ──────────────── */}
      {detail && (
        <Modal onClose={() => setDetail(null)}>
          <div className="modal-header">
            {/* Pastille colorée + titre */}
            <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: TYPE_COULEURS[detail.type]?.bg ?? '#7c6af7',
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

            {detail.description && (
              <div className="modal-detail-row" style={{ alignItems: 'flex-start' }}>
                <span className="modal-detail-label">Notes</span>
                <span style={{ whiteSpace: 'pre-line', color: '#555' }}>{detail.description}</span>
              </div>
            )}

            {detail.source === 'planning' && (
              <p style={{ fontSize: '0.82rem', color: '#aaa', marginTop: 4 }}>
                Issu du planning — à modifier dans la page Équipe.
              </p>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={() => setDetail(null)}>Fermer</button>
            <button className="danger" onClick={() => handleDelete(detail)}>Supprimer</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
