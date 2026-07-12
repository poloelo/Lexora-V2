/**
 * tasks.js — Tâches de département
 *
 * Une tâche appartient à un département : elle est visible par tous les
 * membres de ce département (un admin voit tout). La création/modification/
 * suppression est réservée aux rôles manager et admin ; un manager n'agit
 * que sur son propre département. Le changement de statut (kanban) est
 * ouvert à tous les membres du département.
 *
 * Statuts valides   : 'todo' | 'in_progress' | 'done'
 * Priorités valides : 'low' | 'medium' | 'high'
 */

import { Router } from 'express';
import db from '../models/db.js';
import { verifyJWT, loadUser, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(verifyJWT, loadUser);

const STATUSES   = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const DATE_RE    = /^\d{4}-\d{2}-\d{2}$/;

// SELECT commun : la tâche + noms affichables (département, créateur)
const TASK_SELECT = `
  SELECT t.*, d.nom AS department_nom,
         TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS created_by_nom
  FROM tasks t
  JOIN departements d ON d.id = t.department_id
  LEFT JOIN employes e ON e.id = t.created_by
`;

const getTask = id => db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);

// Vérifie que l'utilisateur peut administrer (créer/modifier/supprimer)
// une tâche du département visé : admin partout, manager chez lui.
function canManage(user, departmentId) {
  if (user.role === 'admin') return true;
  return user.role === 'manager' && user.departement_id === departmentId;
}

// Valide les champs d'écriture communs ; renvoie un message d'erreur ou null
function validateFields({ status, priority, due_date, department_id }) {
  if (status !== undefined && !STATUSES.includes(status)) {
    return `status invalide (attendu : ${STATUSES.join(' | ')})`;
  }
  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    return `priority invalide (attendu : ${PRIORITIES.join(' | ')})`;
  }
  if (due_date != null && due_date !== '' && !DATE_RE.test(due_date)) {
    return 'due_date invalide (format attendu : YYYY-MM-DD)';
  }
  if (department_id !== undefined) {
    const dep = db.prepare('SELECT id FROM departements WHERE id = ?').get(department_id);
    if (!dep) return 'department_id inconnu';
  }
  return null;
}

// GET — Tâches visibles par l'utilisateur
// Admin : tout (filtre optionnel ?department_id=) ; sinon : son département.
// Filtres communs : ?status= &priority=
router.get('/', (req, res) => {
  try {
    const where  = [];
    const params = [];

    if (req.user.role === 'admin') {
      if (req.query.department_id) {
        where.push('t.department_id = ?');
        params.push(req.query.department_id);
      }
    } else {
      if (req.user.departement_id == null) return res.json([]);
      where.push('t.department_id = ?');
      params.push(req.user.departement_id);
    }
    if (req.query.status && STATUSES.includes(req.query.status)) {
      where.push('t.status = ?');
      params.push(req.query.status);
    }
    if (req.query.priority && PRIORITIES.includes(req.query.priority)) {
      where.push('t.priority = ?');
      params.push(req.query.priority);
    }

    const sql = `${TASK_SELECT}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.created_at DESC`;
    res.json(db.prepare(sql).all(...params));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer une tâche (manager de son département, admin partout)
router.post('/', requireRole('manager', 'admin'), (req, res) => {
  try {
    const { title, description, department_id, status, priority, due_date } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title requis' });
    if (!department_id) return res.status(400).json({ error: 'department_id requis' });

    const invalid = validateFields({ status, priority, due_date, department_id });
    if (invalid) return res.status(400).json({ error: invalid });

    if (!canManage(req.user, department_id)) {
      return res.status(403).json({ error: 'Un manager ne peut créer une tâche que dans son département' });
    }

    const result = db.prepare(`
      INSERT INTO tasks (title, description, department_id, created_by, status, priority, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(), description || null, department_id, req.user.id,
      status || 'todo', priority || 'medium', due_date || null
    );
    res.status(201).json(getTask(result.lastInsertRowid));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier une tâche (manager de son département, admin)
router.put('/:id', requireRole('manager', 'admin'), (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche non trouvée' });
    if (!canManage(req.user, task.department_id)) {
      return res.status(403).json({ error: 'Accès refusé : tâche hors de votre département' });
    }

    const { title, description, department_id, status, priority, due_date } = req.body;
    if (title !== undefined && !title?.trim()) {
      return res.status(400).json({ error: 'title requis' });
    }
    const invalid = validateFields({ status, priority, due_date, department_id });
    if (invalid) return res.status(400).json({ error: invalid });

    // Déplacement vers un autre département : il faut aussi y être autorisé
    if (department_id !== undefined && !canManage(req.user, department_id)) {
      return res.status(403).json({ error: 'Accès refusé : département cible hors de votre périmètre' });
    }

    db.prepare(`
      UPDATE tasks SET
        title = ?, description = ?, department_id = ?, status = ?, priority = ?,
        due_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title !== undefined ? title.trim() : task.title,
      description !== undefined ? (description || null) : task.description,
      department_id ?? task.department_id,
      status ?? task.status,
      priority ?? task.priority,
      due_date !== undefined ? (due_date || null) : task.due_date,
      task.id
    );
    res.json(getTask(task.id));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /:id/status — Changement de statut (kanban)
// Ouvert à tout membre du département de la tâche (+ admin) : le tableau
// est interactif pour toute l'équipe, pas seulement les managers.
router.patch('/:id/status', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche non trouvée' });

    const isMember = req.user.departement_id === task.department_id;
    if (req.user.role !== 'admin' && !isMember) {
      return res.status(403).json({ error: 'Accès refusé : tâche hors de votre département' });
    }

    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `status invalide (attendu : ${STATUSES.join(' | ')})` });
    }

    db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, task.id);
    res.json(getTask(task.id));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer une tâche (manager de son département, admin)
router.delete('/:id', requireRole('manager', 'admin'), (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche non trouvée' });
    if (!canManage(req.user, task.department_id)) {
      return res.status(403).json({ error: 'Accès refusé : tâche hors de votre département' });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    res.json({ message: 'Tâche supprimée' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
