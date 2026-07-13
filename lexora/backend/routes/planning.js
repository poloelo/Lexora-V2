/**
 * planning.js — Routes CRUD pour le planning des employés
 *
 * Chaque entrée de planning représente un créneau horaire attribué
 * à un employé (par clé étrangère employe_id) sur un projet, pour une
 * date donnée. Le nom affichable est reconstruit par jointure et renvoyé
 * dans le champ employe_nom.
 *
 * Ces entrées sont également affichées dans le calendrier (Calendrier.jsx)
 * sous forme d'événements de type "planning" (couleur verte).
 *
 * Format des heures : "HH:mm" (ex : "09:00", "17:30")
 * Format des dates  : "YYYY-MM-DD" (ex : "2026-06-15")
 */

import { Router } from 'express';
import db from '../models/db.js';
import { verifyJWT, loadUser } from '../middleware/auth.js';

const router = Router();

// Toutes les routes planning exigent un utilisateur authentifié
router.use(verifyJWT, loadUser);

// SELECT commun : le créneau + nom affichable de l'employé.
// LEFT JOIN : les bases partiellement migrées peuvent contenir des créneaux
// sans employe_id (voir migration dans db.js) — on les renvoie quand même.
const PLANNING_SELECT = `
  SELECT p.*, TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS employe_nom
  FROM planning p
  LEFT JOIN employes e ON e.id = p.employe_id
`;

// GET — Toutes les entrées, triées par date puis par heure de début
router.get('/', (req, res) => {
  try {
    const entries = db.prepare(`${PLANNING_SELECT} ORDER BY p.date ASC, p.heure_debut ASC`).all();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer une entrée de planning
router.post('/', (req, res) => {
  try {
    const { employe_id, date, heure_debut, heure_fin, projet } = req.body;

    // Tous ces champs sont obligatoires pour définir un créneau valide
    if (!employe_id || !date || !heure_debut || !heure_fin) {
      return res.status(400).json({ error: 'employe_id, date, heure_debut et heure_fin requis' });
    }
    const employe = db.prepare('SELECT id FROM employes WHERE id = ?').get(employe_id);
    if (!employe) return res.status(400).json({ error: 'employe_id inconnu' });

    const result = db.prepare(
      'INSERT INTO planning (employe_id, date, heure_debut, heure_fin, projet) VALUES (?, ?, ?, ?, ?)'
    ).run(employe_id, date, heure_debut, heure_fin, projet || null);

    const entry = db.prepare(`${PLANNING_SELECT} WHERE p.id = ?`).get(result.lastInsertRowid);
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

    const { employe_id, date, heure_debut, heure_fin, projet } = req.body;
    if (employe_id !== undefined) {
      const employe = db.prepare('SELECT id FROM employes WHERE id = ?').get(employe_id);
      if (!employe) return res.status(400).json({ error: 'employe_id inconnu' });
    }

    db.prepare(
      'UPDATE planning SET employe_id = ?, date = ?, heure_debut = ?, heure_fin = ?, projet = ? WHERE id = ?'
    ).run(
      employe_id ?? existing.employe_id,
      date ?? existing.date,
      heure_debut ?? existing.heure_debut,
      heure_fin ?? existing.heure_fin,
      projet !== undefined ? projet : existing.projet,
      req.params.id
    );

    const entry = db.prepare(`${PLANNING_SELECT} WHERE p.id = ?`).get(req.params.id);
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
