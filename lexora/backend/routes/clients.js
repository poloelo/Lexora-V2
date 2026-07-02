import express from 'express';
import db from '../models/db.js';

const router = express.Router();

// GET — Tous les clients
router.get('/', (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET — Un client par ID
router.get('/:id', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un client
router.post('/', (req, res) => {
  try {
    const { type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom } = req.body;

    if (!email) return res.status(400).json({ error: 'email requis' });
    if (type_client === 'entreprise' && !raison_sociale) {
      return res.status(400).json({ error: 'raison_sociale requis pour une entreprise' });
    }
    if (type_client !== 'entreprise' && !nom) {
      return res.status(400).json({ error: 'nom requis pour un particulier' });
    }

    const stmt = db.prepare(`
      INSERT INTO clients (type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      type_client || 'particulier', email, telephone, adresse,
      nom, prenom, raison_sociale, siret, tva, contact_nom
    );
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier un client
router.put('/:id', (req, res) => {
  try {
    const { type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom } = req.body;
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });

    db.prepare(`
      UPDATE clients SET type_client = ?, email = ?, telephone = ?, adresse = ?,
      nom = ?, prenom = ?, raison_sociale = ?, siret = ?, tva = ?, contact_nom = ?
      WHERE id = ?
    `).run(type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom, req.params.id);

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer un client
router.delete('/:id', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ message: 'Client supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
