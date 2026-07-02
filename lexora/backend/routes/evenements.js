/**
 * evenements.js — Routes CRUD pour les événements du calendrier
 *
 * Un événement a un titre, une date de début, une date de fin (optionnelle),
 * un type (rdv / tache / rappel / evenement) et une couleur.
 *
 * Les dates sont stockées au format ISO 8601 : "2026-05-20T09:00:00"
 * Ce format est compris directement par new Date() côté frontend.
 */

import { Router } from 'express';
import db from '../models/db.js';

const router = Router();

// GET — Tous les événements, triés par date de début croissante (le plus tôt en premier).
// On utilise ASC pour le calendrier : il est naturel d'afficher les événements
// du passé vers le futur, comme dans un agenda.
router.get('/', (req, res) => {
  try {
    const events = db.prepare(
      'SELECT * FROM evenements ORDER BY date_debut ASC'
    ).all();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET — Un seul événement par ID
router.get('/:id', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Événement non trouvé' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un événement
router.post('/', (req, res) => {
  try {
    const { titre, description, date_debut, date_fin, type, couleur, created_by } = req.body;

    if (!titre) return res.status(400).json({ error: 'titre requis' });
    if (!date_debut) return res.status(400).json({ error: 'date_debut requis' });

    const stmt = db.prepare(`
      INSERT INTO evenements (titre, description, date_debut, date_fin, type, couleur, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      titre,
      description ?? null,
      date_debut,
      date_fin ?? date_debut,
      type ?? 'evenement',
      couleur ?? '#7c6af7',
      created_by ?? null
    );

    const created = db.prepare('SELECT * FROM evenements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier un événement
router.put('/:id', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Événement non trouvé' });

    const { titre, description, date_debut, date_fin, type, couleur } = req.body;
    db.prepare(`
      UPDATE evenements
      SET titre = ?, description = ?, date_debut = ?, date_fin = ?, type = ?, couleur = ?
      WHERE id = ?
    `).run(
      titre ?? event.titre,
      description ?? event.description,
      date_debut ?? event.date_debut,
      date_fin ?? event.date_fin,
      type ?? event.type,
      couleur ?? event.couleur,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer un événement
router.delete('/:id', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Événement non trouvé' });
    db.prepare('DELETE FROM evenements WHERE id = ?').run(req.params.id);
    res.json({ message: 'Événement supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
