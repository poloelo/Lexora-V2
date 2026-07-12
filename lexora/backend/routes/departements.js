/**
 * departements.js — Référentiel des départements
 *
 * Lecture ouverte à tout utilisateur authentifié (nécessaire pour les
 * sélecteurs de l'interface) ; écriture réservée à l'admin.
 */

import { Router } from 'express';
import db from '../models/db.js';
import { verifyJWT, loadUser, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(verifyJWT, loadUser);

// GET — Liste des départements (tout utilisateur authentifié)
router.get('/', (req, res) => {
  try {
    const departements = db.prepare('SELECT id, nom FROM departements ORDER BY nom ASC').all();
    res.json(departements);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un département (admin)
router.post('/', requireRole('admin'), (req, res) => {
  try {
    const { nom } = req.body;
    if (!nom?.trim()) return res.status(400).json({ error: 'nom requis' });

    const existing = db.prepare('SELECT id FROM departements WHERE nom = ?').get(nom.trim());
    if (existing) return res.status(409).json({ error: 'Ce département existe déjà' });

    const result = db.prepare('INSERT INTO departements (nom) VALUES (?)').run(nom.trim());
    const departement = db.prepare('SELECT id, nom FROM departements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(departement);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Renommer un département (admin)
router.put('/:id', requireRole('admin'), (req, res) => {
  try {
    const { nom } = req.body;
    if (!nom?.trim()) return res.status(400).json({ error: 'nom requis' });

    const result = db.prepare('UPDATE departements SET nom = ? WHERE id = ?').run(nom.trim(), req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Département non trouvé' });

    res.json(db.prepare('SELECT id, nom FROM departements WHERE id = ?').get(req.params.id));
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer un département (admin)
// ON DELETE : les tâches du département sont supprimées (CASCADE),
// les employés sont détachés (SET NULL) — voir db.js.
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const result = db.prepare('DELETE FROM departements WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Département non trouvé' });
    res.json({ message: 'Département supprimé' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
