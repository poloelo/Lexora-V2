/**
 * evenements.js — Calendrier unifié (événements + planning fusionnés)
 *
 * Un événement peut être de trois natures selon employe_id et type :
 *
 *  1. GÉNÉRAL (employe_id NULL) — réunion d'équipe, rdv client...
 *     Visible par tous, créable par tout utilisateur authentifié,
 *     modifiable/supprimable par son créateur (ou admin).
 *
 *  2. PLANNING (type 'planning' + employe_id) — "les grandes lignes de la
 *     semaine" d'un employé. Créé/modifié/supprimé uniquement par le manager
 *     du département de l'employé ciblé (ou admin). Visible par tout le
 *     département de l'employé. Toujours vert (#10b981), couleur forcée.
 *
 *  3. PERSONNEL (employe_id = soi-même, type ≠ planning) — échéances et
 *     organisation de sa journée. L'employé choisit la couleur. Visible
 *     par son créateur sur son calendrier ; le manager du département
 *     (et l'admin) y accèdent uniquement via la consultation du dashboard
 *     de l'employé (GET /api/dashboard/:userId).
 *
 * Le calendrier du dashboard est PERSONNEL pour tout le monde, admin
 * compris : chacun voit les événements généraux, ceux qui le ciblent,
 * ceux qu'il a créés, et le planning de son propre département. L'admin
 * garde tous ses droits d'écriture (canSee/canManageEvent), mais sa vue
 * n'agrège plus toute l'entreprise — l'emploi du temps d'un employé se
 * consulte depuis la page Équipe, pas depuis son propre calendrier.
 *
 * Les dates sont stockées au format ISO 8601 : "2026-05-20T09:00:00"
 * Ce format est compris directement par new Date() côté frontend.
 */

import { Router } from 'express';
import db from '../models/db.js';
import { verifyJWT, loadUser } from '../middleware/auth.js';

const router = Router();

// Toutes les routes événements exigent un utilisateur authentifié
router.use(verifyJWT, loadUser);

const TYPES          = ['rdv', 'tache', 'rappel', 'evenement', 'planning'];
const COLOR_RE       = /^#[0-9a-fA-F]{6}$/;
const PLANNING_COLOR = '#10b981';   // Le planning est toujours vert

// SELECT commun : l'événement + noms affichables (employé ciblé, créateur)
const EVENT_SELECT = `
  SELECT ev.*,
         TRIM(COALESCE(cib.prenom, '') || ' ' || COALESCE(cib.nom, '')) AS employe_nom,
         TRIM(COALESCE(cre.prenom, '') || ' ' || COALESCE(cre.nom, '')) AS created_by_nom
  FROM evenements ev
  LEFT JOIN employes cib ON cib.id = ev.employe_id
  LEFT JOIN employes cre ON cre.id = ev.created_by_id
`;

// Clause de visibilité du calendrier personnel (voir l'en-tête) :
// général OU me concerne OU créé par moi OU planning de mon département
// ("les grandes lignes de la semaine" restent partagées dans l'équipe).
// Volontairement PAS de passe-droit admin/manager ici : la vision des
// calendriers des employés passe par GET /api/dashboard/:userId.
const VISIBILITY_WHERE = `(
  ev.employe_id IS NULL
  OR ev.employe_id = @me
  OR ev.created_by_id = @me
  OR (ev.type = 'planning' AND cib.departement_id = @dep)
)`;

// Paramètres nommés de la clause de visibilité pour l'utilisateur courant.
// @dep = -1 si sans département : l'égalité ne matche alors jamais.
const visibilityParams = user => ({
  me:  user.id,
  dep: user.departement_id ?? -1,
});

const getEvent = id => db.prepare(`${EVENT_SELECT} WHERE ev.id = ?`).get(id);

// L'utilisateur administre-t-il le planning de l'employé ciblé ?
// Admin partout ; manager uniquement sur les membres de son département.
function managesTarget(user, employeId) {
  if (user.role === 'admin') return true;
  if (user.role !== 'manager') return false;
  const target = db.prepare('SELECT departement_id FROM employes WHERE id = ?').get(employeId);
  return !!target && target.departement_id != null
      && target.departement_id === user.departement_id;
}

// Droit de modifier/supprimer un événement existant.
function canManageEvent(user, event) {
  if (user.role === 'admin') return true;
  if (event.type === 'planning') {
    return event.employe_id != null && managesTarget(user, event.employe_id);
  }
  return event.created_by_id === user.id;
}

// Droit d'ACCÈS unitaire à un événement (GET /:id, PUT, DELETE).
// Plus large que VISIBILITY_WHERE (qui ne gère que l'affichage du
// calendrier personnel) : l'admin accède à tout, et le manager aux
// événements de son département — nécessaire pour administrer le planning
// et cohérent avec la consultation du dashboard de l'équipe.
function canSee(user, event) {
  if (user.role === 'admin') return true;
  if (event.employe_id == null) return true;
  if (event.employe_id === user.id || event.created_by_id === user.id) return true;
  const target = db.prepare('SELECT departement_id FROM employes WHERE id = ?').get(event.employe_id);
  const sameDep = target?.departement_id != null
               && target.departement_id === user.departement_id;
  if (event.type === 'planning' && sameDep) return true;
  return user.role === 'manager' && sameDep;
}

// Valide les champs d'écriture communs ; renvoie un message d'erreur ou null
function validateFields({ type, couleur, employe_id }) {
  if (type !== undefined && !TYPES.includes(type)) {
    return `type invalide (attendu : ${TYPES.join(' | ')})`;
  }
  if (couleur !== undefined && couleur != null && !COLOR_RE.test(couleur)) {
    return 'couleur invalide (format attendu : #rrggbb)';
  }
  if (employe_id !== undefined && employe_id != null) {
    const emp = db.prepare('SELECT id FROM employes WHERE id = ?').get(employe_id);
    if (!emp) return 'employe_id inconnu';
  }
  return null;
}

// Vérifie le droit de poser un événement sur la cible (création ou déplacement).
// Renvoie un message d'erreur 403 ou null.
function checkTargetRights(user, type, employe_id) {
  if (type === 'planning') {
    if (employe_id == null) return 'employe_id requis pour un événement de planning';
    if (!managesTarget(user, employe_id)) {
      return 'Seul le manager du département de l\'employé (ou un admin) peut gérer son planning';
    }
    return null;
  }
  // Événement non-planning ciblant quelqu'un : soi-même, ou un membre de
  // son département si on est manager/admin.
  if (employe_id != null && employe_id !== user.id && !managesTarget(user, employe_id)) {
    return 'Vous ne pouvez cibler que vous-même avec un événement personnel';
  }
  return null;
}

// Les événements du calendrier personnel d'un utilisateur donné — même
// filtre pour tous les rôles, admin compris (sa vue est personnelle, ses
// droits d'écriture restent entiers via canSee/canManageEvent). Exportée
// pour la vue dashboard consultée par un manager (routes/dashboard.js) :
// le calendrier affiché est celui que la cible verrait elle-même.
export function getEventsVisibleBy(user) {
  return db.prepare(`${EVENT_SELECT} WHERE ${VISIBILITY_WHERE} ORDER BY ev.date_debut ASC`)
    .all(visibilityParams(user));
}

// GET — Événements visibles par l'utilisateur, triés chronologiquement.
router.get('/', (req, res) => {
  try {
    res.json(getEventsVisibleBy(req.user));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET — Un seul événement par ID (même règle de visibilité)
router.get('/:id', (req, res) => {
  try {
    const event = getEvent(req.params.id);
    if (!event || !canSee(req.user, event)) {
      // 404 aussi pour les événements invisibles : ne pas révéler leur existence
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    res.json(event);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un événement (général, planning ou personnel)
router.post('/', (req, res) => {
  try {
    const { titre, description, date_debut, date_fin, type, couleur, employe_id } = req.body;

    if (!titre?.trim()) return res.status(400).json({ error: 'titre requis' });
    if (!date_debut)    return res.status(400).json({ error: 'date_debut requis' });

    const invalid = validateFields({ type, couleur, employe_id });
    if (invalid) return res.status(400).json({ error: invalid });

    const finalType = type ?? 'evenement';
    const denied = checkTargetRights(req.user, finalType, employe_id ?? null);
    if (denied) return res.status(403).json({ error: denied });

    const result = db.prepare(`
      INSERT INTO evenements (titre, description, date_debut, date_fin, type, couleur, employe_id, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      titre.trim(),
      description ?? null,
      date_debut,
      date_fin ?? date_debut,
      finalType,
      // La couleur du planning est imposée : cohérence visuelle du calendrier
      finalType === 'planning' ? PLANNING_COLOR : (couleur ?? '#7c6af7'),
      employe_id ?? null,
      req.user.id
    );

    res.status(201).json(getEvent(result.lastInsertRowid));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier un événement (créateur, manager du département pour le
// planning, admin partout)
router.put('/:id', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
    if (!event || !canSee(req.user, event)) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ error: 'Accès refusé : vous ne pouvez pas modifier cet événement' });
    }

    const { titre, description, date_debut, date_fin, type, couleur, employe_id } = req.body;
    if (titre !== undefined && !titre?.trim()) {
      return res.status(400).json({ error: 'titre requis' });
    }
    const invalid = validateFields({ type, couleur, employe_id });
    if (invalid) return res.status(400).json({ error: invalid });

    // Droits revérifiés sur la valeur FINALE (changement de type ou de cible)
    const finalType   = type ?? event.type;
    const finalTarget = employe_id !== undefined ? employe_id : event.employe_id;
    const denied = checkTargetRights(req.user, finalType, finalTarget);
    if (denied) return res.status(403).json({ error: denied });

    db.prepare(`
      UPDATE evenements
      SET titre = ?, description = ?, date_debut = ?, date_fin = ?, type = ?, couleur = ?, employe_id = ?
      WHERE id = ?
    `).run(
      titre !== undefined ? titre.trim() : event.titre,
      description ?? event.description,
      date_debut ?? event.date_debut,
      date_fin ?? event.date_fin,
      finalType,
      finalType === 'planning' ? PLANNING_COLOR : (couleur ?? event.couleur),
      finalTarget,
      event.id
    );

    res.json(getEvent(event.id));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer un événement (mêmes droits que la modification)
router.delete('/:id', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
    if (!event || !canSee(req.user, event)) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ error: 'Accès refusé : vous ne pouvez pas supprimer cet événement' });
    }

    db.prepare('DELETE FROM evenements WHERE id = ?').run(event.id);
    res.json({ message: 'Événement supprimé' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
