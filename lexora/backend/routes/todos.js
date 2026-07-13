/**
 * todos.js — Post-its personnels
 *
 * Un todo est une mini-tâche nominative assignée à un ou plusieurs employés
 * (table de jointure todo_assignees), affichée côté frontend comme un
 * post-it coloré sur le dashboard de l'employé.
 *
 * Visibilité   : ses propres créations + les todos qui nous sont assignés.
 * Modification : créateur uniquement (contenu, couleur, assignés, suppression).
 * Toggle       : créateur OU assigné peuvent marquer fait / à faire.
 * Assignation  : tout utilisateur authentifié peut assigner un post-it à
 *                n'importe quel collègue (esprit "mur de post-its" partagé).
 */

import { Router } from 'express';
import db from '../models/db.js';
import { verifyJWT, loadUser } from '../middleware/auth.js';

const router = Router();

router.use(verifyJWT, loadUser);

const CONTENT_MAX = 280;              // Un post-it reste court
const COLOR_RE    = /^#[0-9a-fA-F]{6}$/;

// Récupère un todo avec ses assignés (id + nom affichable, rien de plus — RGPD)
function getTodoWithAssignees(id) {
  const todo = db.prepare(`
    SELECT t.*, TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS created_by_nom
    FROM todos t
    LEFT JOIN employes e ON e.id = t.created_by
    WHERE t.id = ?
  `).get(id);
  if (!todo) return null;
  todo.assignees = db.prepare(`
    SELECT e.id, TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS nom
    FROM todo_assignees ta
    JOIN employes e ON e.id = ta.assignee_id
    WHERE ta.todo_id = ?
    ORDER BY nom
  `).all(id);
  return todo;
}

const isAssignee = (todoId, userId) =>
  !!db.prepare('SELECT 1 FROM todo_assignees WHERE todo_id = ? AND assignee_id = ?').get(todoId, userId);

// Valide contenu / couleur / liste d'assignés ; renvoie un message ou null
function validateFields({ content, color, assignee_ids }) {
  if (content !== undefined) {
    if (!content?.trim()) return 'content requis';
    if (content.trim().length > CONTENT_MAX) return `content trop long (max ${CONTENT_MAX} caractères)`;
  }
  if (color !== undefined && color != null && !COLOR_RE.test(color)) {
    return 'color invalide (format attendu : #rrggbb)';
  }
  if (assignee_ids !== undefined) {
    if (!Array.isArray(assignee_ids) || assignee_ids.length === 0) {
      return 'assignee_ids doit être une liste non vide';
    }
    const findEmp = db.prepare('SELECT id FROM employes WHERE id = ?');
    for (const id of assignee_ids) {
      if (!findEmp.get(id)) return `assignee_ids : employé ${id} inconnu`;
    }
  }
  return null;
}

const replaceAssignees = db.transaction((todoId, assigneeIds) => {
  db.prepare('DELETE FROM todo_assignees WHERE todo_id = ?').run(todoId);
  const insert = db.prepare('INSERT OR IGNORE INTO todo_assignees (todo_id, assignee_id) VALUES (?, ?)');
  for (const id of assigneeIds) insert.run(todoId, id);
});

// GET — Mes todos : ceux que j'ai créés + ceux qui me sont assignés
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT t.id
      FROM todos t
      LEFT JOIN todo_assignees ta ON ta.todo_id = t.id
      WHERE t.created_by = ? OR ta.assignee_id = ?
      ORDER BY t.created_at DESC
    `).all(req.user.id, req.user.id);
    res.json(rows.map(r => getTodoWithAssignees(r.id)));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un todo (tout utilisateur ; assignation libre à tout collègue)
router.post('/', (req, res) => {
  try {
    const { content, color } = req.body;
    // Par défaut, un post-it sans assigné explicite est pour soi-même
    const assignee_ids = req.body.assignee_ids ?? [req.user.id];

    const invalid = validateFields({ content, color, assignee_ids });
    if (invalid) return res.status(400).json({ error: invalid });

    const result = db.prepare(
      'INSERT INTO todos (content, color, created_by) VALUES (?, ?, ?)'
    ).run(content.trim(), color || '#fef3c7', req.user.id);
    replaceAssignees(result.lastInsertRowid, assignee_ids);

    res.status(201).json(getTodoWithAssignees(result.lastInsertRowid));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier un todo (créateur uniquement)
router.put('/:id', (req, res) => {
  try {
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
    if (!todo) return res.status(404).json({ error: 'Todo non trouvé' });
    if (todo.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Seul le créateur peut modifier ce todo' });
    }

    const { content, color, assignee_ids } = req.body;
    const invalid = validateFields({ content, color, assignee_ids });
    if (invalid) return res.status(400).json({ error: invalid });

    db.prepare(`
      UPDATE todos SET content = ?, color = ?, updated_at = datetime('now') WHERE id = ?
    `).run(
      content !== undefined ? content.trim() : todo.content,
      color !== undefined ? (color || todo.color) : todo.color,
      todo.id
    );
    if (assignee_ids !== undefined) replaceAssignees(todo.id, assignee_ids);

    res.json(getTodoWithAssignees(todo.id));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /:id/toggle — Basculer fait / à faire (créateur OU assigné)
router.patch('/:id/toggle', (req, res) => {
  try {
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
    if (!todo) return res.status(404).json({ error: 'Todo non trouvé' });

    const allowed = todo.created_by === req.user.id || isAssignee(todo.id, req.user.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Seuls le créateur ou un assigné peuvent changer ce statut' });
    }

    const done = todo.status !== 'done';
    db.prepare(`
      UPDATE todos SET
        status = ?, done_at = CASE WHEN ? THEN datetime('now') ELSE NULL END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(done ? 'done' : 'pending', done ? 1 : 0, todo.id);

    res.json(getTodoWithAssignees(todo.id));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer un todo (créateur uniquement)
router.delete('/:id', (req, res) => {
  try {
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
    if (!todo) return res.status(404).json({ error: 'Todo non trouvé' });
    if (todo.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Seul le créateur peut supprimer ce todo' });
    }

    db.prepare('DELETE FROM todos WHERE id = ?').run(todo.id);
    res.json({ message: 'Todo supprimé' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
