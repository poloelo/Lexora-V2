/**
 * dashboard.js — Consultation du dashboard d'un employé (lecture seule)
 *
 * Le dashboard personnel (post-its → tâches → calendrier) est alimenté en
 * temps normal par trois appels séparés (/api/todos, /api/tasks,
 * /api/evenements), chacun calculé depuis req.user.
 *
 * Cette route permet à un MANAGER de consulter le dashboard d'un employé
 * de SON département (l'admin peut consulter tout le monde) : elle
 * réagrège les trois mêmes requêtes, mais calculées "comme si" on était
 * l'employé ciblé. Les fonctions sont importées des routers d'origine
 * (getTodosOfUser, getTasksOfDepartment, getEventsVisibleBy) : une seule
 * source de vérité pour chaque requête.
 *
 * Strictement en LECTURE : aucune route d'écriture n'existe ici — un
 * manager ne peut pas agir "pour le compte de" l'employé consulté.
 *
 * Autorisation : admin, ou manager du département de la cible → sinon 403.
 * NB : les post-its de l'employé sont la seule donnée que le manager ne
 * voyait pas déjà ailleurs (tâches = département commun, événements =
 * règles de visibilité existantes) — extension de visibilité assumée,
 * limitée au manager direct.
 */

import { Router } from 'express';
import db from '../models/db.js';
import { verifyJWT, loadUser } from '../middleware/auth.js';
import { getTodosOfUser } from './todos.js';
import { getTasksOfDepartment } from './tasks.js';
import { getEventsVisibleBy } from './evenements.js';

const router = Router();

router.use(verifyJWT, loadUser);

// GET /api/dashboard/:userId — Données du dashboard de l'employé ciblé
// Réponse : { user, todos, tasks, evenements }
router.get('/:userId', (req, res) => {
  try {
    const target = db.prepare(`
      SELECT e.id, e.nom, e.prenom, e.poste, e.role, e.departement_id, d.nom AS departement_nom
      FROM employes e
      LEFT JOIN departements d ON d.id = e.departement_id
      WHERE e.id = ?
    `).get(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Employé non trouvé' });

    const allowed = req.user.role === 'admin'
      || (req.user.role === 'manager'
          && target.departement_id != null
          && target.departement_id === req.user.departement_id);
    if (!allowed) {
      return res.status(403).json({ error: 'Accès refusé : réservé au manager du département de l\'employé (ou admin)' });
    }

    res.json({
      // Fiche minimale de la cible (pas d'email ni de salaire : la vue
      // n'en a pas besoin — minimisation des données)
      user: {
        id:              target.id,
        nom:             target.nom,
        prenom:          target.prenom,
        poste:           target.poste,
        departement_nom: target.departement_nom,
      },
      todos:      getTodosOfUser(target.id),
      tasks:      target.departement_id != null ? getTasksOfDepartment(target.departement_id) : [],
      // Le calendrier que la cible verrait elle-même (généraux + planning
      // de son département + ses événements personnels)
      evenements: getEventsVisibleBy(target),
    });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
