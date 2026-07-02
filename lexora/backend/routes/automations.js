import express from 'express';
import db from '../models/db.js';
import { verifyJWT } from '../middleware/auth.js';

const router = express.Router();

const isAdmin = verifyJWT;

// GET — Toutes les automations
router.get('/', isAdmin, (req, res) => {
  try {
    const automations = db.prepare('SELECT * FROM automations ORDER BY created_at DESC').all();
    res.json(automations);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer une automation
router.post('/', isAdmin, (req, res) => {
  try {
    const { nom, description, type, frequence, action, actif } = req.body;
    if (!nom) return res.status(400).json({ error: 'nom requis' });
    if (!action) return res.status(400).json({ error: 'action requise' });
    const stmt = db.prepare(`
      INSERT INTO automations (nom, description, type, frequence, action, actif)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(nom, description, type, frequence, action, actif ? 1 : 0);
    const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(automation);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier une automation
router.put('/:id', isAdmin, (req, res) => {
  try {
    const { nom, description, type, frequence, action, actif } = req.body;
    const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
    if (!automation) return res.status(404).json({ error: 'Automation non trouvée' });
    db.prepare(`
      UPDATE automations SET nom = ?, description = ?, type = ?, frequence = ?, action = ?, actif = ?
      WHERE id = ?
    `).run(nom, description, type, frequence, action, actif ? 1 : 0, req.params.id);
    const updated = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer une automation
router.delete('/:id', isAdmin, (req, res) => {
  try {
    const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
    if (!automation) return res.status(404).json({ error: 'Automation non trouvée' });
    db.prepare('DELETE FROM automations WHERE id = ?').run(req.params.id);
    res.json({ message: 'Automation supprimée' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
