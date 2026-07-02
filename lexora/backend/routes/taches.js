/**
 * taches.js — Routes CRUD pour les tâches projet
 *
 * Une tâche a un titre (obligatoire), une description, un statut
 * (todo / in_progress / done) et peut être assignée à quelqu'un.
 *
 * Statuts valides : 'todo' | 'in_progress' | 'done'
 */

import { Router } from 'express';
import db from '../models/db.js';

const router = Router();

// GET — Toutes les tâches, de la plus récente à la plus ancienne
router.get('/', (req, res) => {
  try {
    const taches = db.prepare('SELECT * FROM taches ORDER BY created_at DESC').all();
    res.json(taches);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer une tâche
router.post('/', (req, res) => {
  try {
    const { titre, description, statut, assignee } = req.body;
    if (!titre) return res.status(400).json({ error: 'titre requis' });

    const result = db.prepare(
      'INSERT INTO taches (titre, description, statut, assignee) VALUES (?, ?, ?, ?)'
    ).run(titre, description || null, statut || 'todo', assignee || null);

    const tache = db.prepare('SELECT * FROM taches WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tache);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier une tâche
// BUG CORRIGÉ : validation du champ requis avant l'UPDATE pour éviter
// de stocker un titre NULL qui violerait la contrainte NOT NULL de SQLite.
router.put('/:id', (req, res) => {
  try {
    const { titre, description, statut, assignee } = req.body;

    // Validation : titre est NOT NULL en base, on le vérifie ici proprement
    if (!titre) return res.status(400).json({ error: 'titre requis' });

    const result = db.prepare(
      'UPDATE taches SET titre = ?, description = ?, statut = ?, assignee = ? WHERE id = ?'
    ).run(titre, description, statut, assignee, req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Tâche non trouvée' });

    const tache = db.prepare('SELECT * FROM taches WHERE id = ?').get(req.params.id);
    res.json(tache);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer une tâche
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM taches WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Tâche non trouvée' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
