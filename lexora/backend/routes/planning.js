/**
 * planning.js — Routes CRUD pour le planning des employés
 *
 * Chaque entrée de planning représente un créneau horaire attribué
 * à un employé sur un projet, pour une date donnée.
 *
 * Ces entrées sont également affichées dans le calendrier (Calendrier.jsx)
 * sous forme d'événements de type "planning" (couleur verte).
 *
 * Format des heures : "HH:mm" (ex : "09:00", "17:30")
 * Format des dates  : "YYYY-MM-DD" (ex : "2026-06-15")
 */

import { Router } from 'express';
import db from '../models/db.js';

const router = Router();

// GET — Toutes les entrées, triées par date puis par heure de début
router.get('/', (req, res) => {
  try {
    const entries = db.prepare('SELECT * FROM planning ORDER BY date ASC, heure_debut ASC').all();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer une entrée de planning
router.post('/', (req, res) => {
  try {
    const { employe, date, heure_debut, heure_fin, projet } = req.body;

    // Tous ces champs sont obligatoires pour définir un créneau valide
    if (!employe || !date || !heure_debut || !heure_fin) {
      return res.status(400).json({ error: 'employe, date, heure_debut et heure_fin requis' });
    }

    const result = db.prepare(
      'INSERT INTO planning (employe, date, heure_debut, heure_fin, projet) VALUES (?, ?, ?, ?, ?)'
    ).run(employe, date, heure_debut, heure_fin, projet || null);

    const entry = db.prepare('SELECT * FROM planning WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier une entrée de planning
router.put('/:id', (req, res) => {
  try {
    // Vérifier l'existence avant la mise à jour
    const existing = db.prepare('SELECT * FROM planning WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Entrée non trouvée' });

    const { employe, date, heure_debut, heure_fin, projet } = req.body;
    db.prepare(
      'UPDATE planning SET employe = ?, date = ?, heure_debut = ?, heure_fin = ?, projet = ? WHERE id = ?'
    ).run(employe, date, heure_debut, heure_fin, projet, req.params.id);

    const entry = db.prepare('SELECT * FROM planning WHERE id = ?').get(req.params.id);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer une entrée de planning
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM planning WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Entrée non trouvée' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
