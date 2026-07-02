/**
 * factures.js — Routes CRUD pour les factures
 *
 * Une facture est liée à un client (nom libre, pas de FK) et a un montant réel.
 * Statuts valides : 'en attente' | 'payee' | 'annulee'
 *
 * Note : les dates sont stockées sous forme de chaînes ISO "YYYY-MM-DD".
 */

import { Router } from 'express';
import db from '../models/db.js';

const router = Router();

// GET — Toutes les factures, de la plus récente à la plus ancienne
router.get('/', (req, res) => {
  try {
    const factures = db.prepare('SELECT * FROM factures ORDER BY id DESC').all();
    res.json(factures);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer une facture
router.post('/', (req, res) => {
  try {
    const { client, montant, statut, date_emission, date_echeance } = req.body;

    // client et montant sont les deux champs obligatoires
    if (!client) return res.status(400).json({ error: 'client requis' });
    if (montant === undefined || montant === null) return res.status(400).json({ error: 'montant requis' });

    const result = db.prepare(
      'INSERT INTO factures (client, montant, statut, date_emission, date_echeance) VALUES (?, ?, ?, ?, ?)'
    ).run(client, montant, statut || 'en attente', date_emission || null, date_echeance || null);

    const facture = db.prepare('SELECT * FROM factures WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(facture);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier une facture
// BUG CORRIGÉ : validation des champs requis avant l'UPDATE pour éviter
// de stocker des valeurs NULL sur des colonnes NOT NULL.
router.put('/:id', (req, res) => {
  try {
    const { client, montant, statut, date_emission, date_echeance } = req.body;

    // Validation des champs obligatoires
    if (!client) return res.status(400).json({ error: 'client requis' });
    if (montant === undefined || montant === null) return res.status(400).json({ error: 'montant requis' });

    const result = db.prepare(
      'UPDATE factures SET client = ?, montant = ?, statut = ?, date_emission = ?, date_echeance = ? WHERE id = ?'
    ).run(client, montant, statut, date_emission, date_echeance, req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Facture non trouvée' });

    const facture = db.prepare('SELECT * FROM factures WHERE id = ?').get(req.params.id);
    res.json(facture);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer une facture
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM factures WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Facture non trouvée' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
